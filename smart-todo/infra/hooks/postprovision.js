'use strict';

/*
 * SmartTodo azd postprovision hook (CommonJS).
 *
 * Adds the Function App's system-assigned managed identity as an Azure SQL
 * database user with db_datareader / db_datawriter / db_ddladmin, then applies
 * the idempotent schema + seed. All external commands use execFileSync argument
 * arrays with shell:false — no shell interpolation, traps, command substitution,
 * curl, grep, or OS-specific path syntax. Tokens, passwords, and connection
 * strings are never printed.
 *
 * A temporary firewall rule (for the developer host) and any Redirect->Proxy
 * connection-policy change are always reverted in the finally block.
 */

const { spawnSync } = require('node:child_process');
const https = require('node:https');
const path = require('node:path');

const WINDOWS_CLI_RUNNER = [
  "$ErrorActionPreference = 'Stop'",
  '$payload = ConvertFrom-Json -InputObject $env:AZURE_NATIVE_CLI_PAYLOAD',
  '$command = [string]$payload[0]',
  '$arguments = @($payload | Select-Object -Skip 1)',
  '$resolved = Get-Command -Name $command -ErrorAction Stop',
  '$target = [string]$resolved.Source',
  'if (-not $target) { $target = $command }',
  'if ($target.EndsWith(".cmd", [System.StringComparison]::OrdinalIgnoreCase) -or $target.EndsWith(".bat", [System.StringComparison]::OrdinalIgnoreCase)) {',
  "  $unsafe = [char[]]'\"&|<>^%!()'",
  '  foreach ($argument in $arguments) { $text = [string]$argument; if ($text.IndexOfAny($unsafe) -ge 0 -or $text.Contains([char]10) -or $text.Contains([char]13)) { [Console]::Error.WriteLine("Arguments containing shell metacharacters or control characters cannot be passed safely to a Windows .cmd/.bat shim."); exit 2 } }',
  '}',
  '& $target @arguments',
  '$ok = $?',
  '$code = $LASTEXITCODE',
  'if ($null -ne $code) { exit $code }',
  'if (-not $ok) { exit 1 }',
].join('; ');

function run(command, args, options = {}) {
  const invocation = process.platform === 'win32'
    ? {
        file: 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_CLI_RUNNER],
        env: { ...process.env, AZURE_NATIVE_CLI_PAYLOAD: JSON.stringify([command, ...args]) },
      }
    : { file: command, args, env: process.env };
  const result = spawnSync(invocation.file, invocation.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    ...options,
    env: invocation.env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || '').toString();
}

// Run a command purely to check availability; return true/false.
function available(command, args) {
  try {
    run(command, args);
    return true;
  } catch {
    return false;
  }
}

function azdEnvValue(key) {
  const value = run('azd', ['env', 'get-value', key]).trim();
  if (!value || value === 'ERROR' || /not found/i.test(value)) {
    throw new Error(`azd environment value "${key}" is not set.`);
  }
  return value;
}

// Escape a bracket-quoted SQL identifier: ] -> ]].
function quoteIdent(name) {
  return `[${String(name).replace(/]/g, ']]')}]`;
}

// Escape a single-quoted SQL string literal: ' -> ''.
function quoteString(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}

function getPublicIp() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://api.ipify.org', (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Public IP lookup returned HTTP ${res.statusCode}.`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const ip = body.trim();
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
          reject(new Error('Public IP lookup returned an unexpected value.'));
          return;
        }
        resolve(ip);
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Public IP lookup timed out.'));
    });
  });
}

async function main() {
  const AZ = 'az';
  const NODE = process.execPath;
  const SQLCMD = 'sqlcmd';

  // 1. Fail before making any Azure changes if a required tool is unavailable.
  const preflight = [
    ['az', AZ, ['version', '-o', 'json']],
    ['azd', 'azd', ['version']],
    ['node', NODE, ['--version']],
    ['sqlcmd', SQLCMD, ['--version']],
  ];
  for (const [label, command, args] of preflight) {
    if (!available(command, args)) {
      throw new Error(`Required tool "${label}" is not available on PATH. Aborting before any Azure changes.`);
    }
  }

  // 2. Read deployment outputs from the azd environment.
  const sqlServerRaw = azdEnvValue('SQL_SERVER_NAME');
  const sqlDatabase = azdEnvValue('SQL_DATABASE_NAME');
  const functionAppName = azdEnvValue('FUNCTION_APP_NAME');
  const resourceGroup = azdEnvValue('RESOURCE_GROUP_NAME');

  // 3. Normalize the SQL server to both short name and FQDN in JavaScript.
  const shortServerName = sqlServerRaw.replace(/\.database\.windows\.net$/i, '');
  const serverFqdn = `${shortServerName}.database.windows.net`;

  console.log(`Post-provision: configuring SQL database "${sqlDatabase}" on ${serverFqdn}.`);

  // 4. Read the current connection policy; switch Redirect -> Proxy if needed.
  let originalPolicy = '';
  let policyChanged = false;
  try {
    originalPolicy = run(AZ, [
      'sql', 'server', 'conn-policy', 'show',
      '--resource-group', resourceGroup,
      '--name', shortServerName,
      '--query', 'connectionType',
      '-o', 'tsv',
    ]).trim();
  } catch {
    originalPolicy = '';
  }

  const ruleName = `postprovision-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  let firewallCreated = false;

  try {
    if (/^redirect$/i.test(originalPolicy)) {
      console.log('Connection policy is Redirect; temporarily switching to Proxy.');
      run(AZ, [
        'sql', 'server', 'conn-policy', 'update',
        '--resource-group', resourceGroup,
        '--name', shortServerName,
        '--connection-type', 'Proxy',
      ]);
      policyChanged = true;
    }

    // 5. Create a temporary firewall rule for the developer host public IP.
    const publicIp = await getPublicIp();
    console.log('Creating a temporary SQL firewall rule for this host.');
    run(AZ, [
      'sql', 'server', 'firewall-rule', 'create',
      '--resource-group', resourceGroup,
      '--server', shortServerName,
      '--name', ruleName,
      '--start-ip-address', publicIp,
      '--end-ip-address', publicIp,
    ]);
    firewallCreated = true;

    // 6. Create the Function App managed-identity user and grant roles.
    const user = quoteIdent(functionAppName);
    const userLiteral = quoteString(functionAppName);
    const grantTsql = [
      `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = ${userLiteral})`,
      'BEGIN',
      `    CREATE USER ${user} FROM EXTERNAL PROVIDER;`,
      'END;',
      `ALTER ROLE db_datareader ADD MEMBER ${user};`,
      `ALTER ROLE db_datawriter ADD MEMBER ${user};`,
      `ALTER ROLE db_ddladmin ADD MEMBER ${user};`,
    ].join('\n');

    console.log(`Ensuring managed-identity database user for "${functionAppName}".`);
    run(SQLCMD, [
      '-S', serverFqdn,
      '-d', sqlDatabase,
      '--authentication-method', 'ActiveDirectoryAzCli',
      '-l', '60',
      '-b',
      '-Q', grantTsql,
    ]);

    // 7. Apply the idempotent schema + seed.
    const schemaPath = path.join(__dirname, 'postprovision-schema.sql');
    console.log('Applying schema and seed data (idempotent).');
    run(SQLCMD, [
      '-S', serverFqdn,
      '-d', sqlDatabase,
      '--authentication-method', 'ActiveDirectoryAzCli',
      '-l', '60',
      '-b',
      '-i', schemaPath,
    ]);
  } finally {
    // 8. Always revert the firewall rule and the connection policy.
    if (firewallCreated) {
      try {
        run(AZ, [
          'sql', 'server', 'firewall-rule', 'delete',
          '--resource-group', resourceGroup,
          '--server', shortServerName,
          '--name', ruleName,
        ]);
        console.log('Removed temporary SQL firewall rule.');
      } catch (err) {
        console.error(`Warning: failed to remove temporary firewall rule "${ruleName}": ${err.message}`);
      }
    }
    if (policyChanged) {
      try {
        run(AZ, [
          'sql', 'server', 'conn-policy', 'update',
          '--resource-group', resourceGroup,
          '--name', shortServerName,
          '--connection-type', originalPolicy,
        ]);
        console.log(`Restored SQL connection policy to ${originalPolicy}.`);
      } catch (err) {
        console.error(`Warning: failed to restore connection policy to ${originalPolicy}: ${err.message}`);
      }
    }
  }

  // 9. Only reached when every required step above succeeded.
  console.log('Post-provision SQL setup complete.');
}

module.exports = { run };

if (require.main === module) {
  main().catch((err) => {
    console.error(`Post-provision failed: ${err.message}`);
    process.exit(1);
  });
}
