#!/usr/bin/env node
// Portable structural static check for the SwiftUI sources. No Swift compiler is
// available (and the iOS SDK does not exist on Linux), so this validates what
// can be checked statically without a toolchain:
//   - balanced braces / parens / brackets (ignoring strings and comments)
//   - balanced string literals
//   - required imports and a few contract-critical invariants
// Run: `node scripts/swift-static-check.mjs`

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..', 'SmartTodo');

const failures = [];
const fail = (file, msg) => failures.push(`${file}: ${msg}`);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry.endsWith('.xcodeproj')) continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.swift')) {
      out.push(full);
    }
  }
  return out;
}

// Strip strings and comments; return cleaned source plus whether strings balanced.
function analyze(src) {
  let out = '';
  let i = 0;
  let stringBalanced = true;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    // Line comment
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // Block comment (Swift allows nesting)
    if (c === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (src[i] === '/' && src[i + 1] === '*') { depth++; i += 2; }
        else if (src[i] === '*' && src[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    // Multiline string literal
    if (c === '"' && src[i + 1] === '"' && src[i + 2] === '"') {
      i += 3;
      let closed = false;
      while (i < n) {
        if (src[i] === '"' && src[i + 1] === '"' && src[i + 2] === '"') { i += 3; closed = true; break; }
        i++;
      }
      if (!closed) stringBalanced = false;
      out += '""'; // placeholder
      continue;
    }
    // Regular string literal
    if (c === '"') {
      i++;
      let closed = false;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '"') { i++; closed = true; break; }
        if (src[i] === '\n') break; // unterminated on this line
        i++;
      }
      if (!closed) stringBalanced = false;
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return { cleaned: out, stringBalanced };
}

function checkBalance(file, cleaned) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const opens = new Set(['(', '[', '{']);
  const stack = [];
  for (const ch of cleaned) {
    if (opens.has(ch)) stack.push(ch);
    else if (ch in pairs) {
      const top = stack.pop();
      if (top !== pairs[ch]) {
        fail(file, `unbalanced delimiter: found "${ch}" without matching "${pairs[ch]}".`);
        return;
      }
    }
  }
  if (stack.length > 0) {
    fail(file, `unclosed delimiter(s): ${stack.join(' ')}`);
  }
}

const files = walk(appRoot);
if (files.length === 0) fail('(root)', 'no Swift files found.');

for (const file of files) {
  const rel = relative(join(here, '..'), file);
  const src = readFileSync(file, 'utf8');
  const { cleaned, stringBalanced } = analyze(src);
  if (!stringBalanced) fail(rel, 'unterminated string literal.');
  checkBalance(rel, cleaned);
}

// Invariant checks
const byName = Object.fromEntries(files.map((f) => [f.split('/').pop(), readFileSync(f, 'utf8')]));

function requireContains(fileName, needle, desc) {
  const content = byName[fileName];
  if (content === undefined) { fail(fileName, 'file missing.'); return; }
  if (!content.includes(needle)) fail(fileName, `expected ${desc}.`);
}

requireContains('Config.swift', '#if DEBUG', '#if DEBUG conditional for base URL');
requireContains('Config.swift', 'apiBaseURL', 'apiBaseURL constant');
requireContains('APIClient.swift', 'Config.apiBaseURL', 'base URL read from Config (not hardcoded)');
requireContains('APIClient.swift', 'async throws', 'async throws API methods');
requireContains('APIClient.swift', 'sendNoContent', 'DELETE path that does not decode JSON');
requireContains('TodoDetailView.swift', 'sparkles', 'Generate Steps icon');
requireContains('TodoDetailView.swift', 'arrow.clockwise', 'Regenerate Steps icon');
requireContains('TodoListView.swift', '.refreshable', 'pull-to-refresh');
requireContains('ActionStepsView.swift', 'ProgressView', 'progress bar');

// No hardcoded http URL outside Config.swift
for (const [name, content] of Object.entries(byName)) {
  if (name === 'Config.swift') continue;
  if (/https?:\/\/[^"']*azurewebsites|http:\/\/localhost/.test(content)) {
    fail(name, 'hardcoded API URL found; URLs must come from Config.swift.');
  }
}

console.log('SmartTodo Swift static check');
console.log('============================');
console.log(`  scanned ${files.length} Swift files`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  FAIL', f);
  console.log(`\n${failures.length} issue(s).`);
  process.exit(1);
}
console.log('  ok   delimiters, strings, and invariants all pass.');
process.exit(0);
