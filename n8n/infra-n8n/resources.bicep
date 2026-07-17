@description('Location for all resources.')
param location string

@description('Tags applied to all resources.')
param tags object

@description('Unique token for resource naming.')
param resourceToken string

@description('Resource name abbreviations.')
param abbrs object

@secure()
@description('PostgreSQL administrator password.')
param postgresPassword string

@secure()
@description('n8n encryption key.')
param n8nEncryptionKey string

@description('n8n container image.')
param n8nImage string

var postgresAdminUser = 'n8nadmin'
var postgresDatabase = 'n8n'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${abbrs.logAnalyticsWorkspace}-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${abbrs.userAssignedIdentity}-${resourceToken}'
  location: location
  tags: tags
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${abbrs.postgresqlServer}-${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }

  resource database 'databases@2024-08-01' = {
    name: postgresDatabase
    properties: {
      charset: 'UTF8'
      collation: 'en_US.utf8'
    }
  }

  resource allowAzure 'firewallRules@2024-08-01' = {
    name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
    properties: {
      startIpAddress: '0.0.0.0'
      endIpAddress: '0.0.0.0'
    }
  }
}

resource containerEnv 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: '${abbrs.containerAppsEnvironment}-${resourceToken}'
  location: location
  tags: tags
  properties: {
    zoneRedundant: false
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: '${abbrs.containerApp}-n8n-${resourceToken}'
  location: location
  tags: union(tags, { 'azd-service-name': 'n8n' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 5678
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      secrets: [
        {
          name: 'postgres-password'
          value: postgresPassword
        }
        {
          name: 'n8n-encryption-key'
          value: n8nEncryptionKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'n8n'
          image: n8nImage
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'DB_TYPE', value: 'postgresdb' }
            { name: 'DB_POSTGRESDB_HOST', value: postgres.properties.fullyQualifiedDomainName }
            { name: 'DB_POSTGRESDB_PORT', value: '5432' }
            { name: 'DB_POSTGRESDB_DATABASE', value: postgresDatabase }
            { name: 'DB_POSTGRESDB_USER', value: postgresAdminUser }
            { name: 'DB_POSTGRESDB_PASSWORD', secretRef: 'postgres-password' }
            { name: 'DB_POSTGRESDB_SSL_ENABLED', value: 'true' }
            { name: 'DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED', value: 'false' }
            { name: 'DB_POSTGRESDB_CONNECTION_TIMEOUT', value: '60000' }
            { name: 'N8N_ENCRYPTION_KEY', secretRef: 'n8n-encryption-key' }
            { name: 'N8N_PORT', value: '5678' }
            { name: 'N8N_PROTOCOL', value: 'https' }
            { name: 'N8N_ENDPOINT_HEALTH', value: 'healthz' }
            { name: 'N8N_HOST', value: '${abbrs.containerApp}-n8n-${resourceToken}.${containerEnv.properties.defaultDomain}' }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                port: 5678
                path: '/healthz'
                scheme: 'HTTP'
              }
              periodSeconds: 30
              timeoutSeconds: 10
              failureThreshold: 10
            }
            {
              type: 'Liveness'
              httpGet: {
                port: 5678
                path: '/healthz'
                scheme: 'HTTP'
              }
              initialDelaySeconds: 60
              periodSeconds: 30
              timeoutSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                port: 5678
                path: '/healthz'
                scheme: 'HTTP'
              }
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
              successThreshold: 1
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scale'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    postgres::database
    postgres::allowAzure
  ]
}

output N8N_URL string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output N8N_CONTAINER_APP_NAME string = containerApp.name
