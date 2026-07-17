@description('Azure region for resources.')
param location string

@description('Resource tags including azd-env-name.')
param tags object

@description('Unique token for resource naming.')
param resourceToken string

@description('Resource name abbreviations.')
param abbrs object

@description('Grafana admin username.')
param grafanaAdminUser string

@secure()
@description('Grafana admin password.')
param grafanaAdminPassword string

@description('Grafana container image.')
param grafanaImage string

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${abbrs.logAnalyticsWorkspace}${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      searchVersion: 1
    }
  }
}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${abbrs.containerAppsEnvironment}${resourceToken}'
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

resource grafanaApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${abbrs.containerApp}grafana-${resourceToken}'
  location: location
  tags: union(tags, {
    'azd-service-name': 'grafana'
  })
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
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
          name: 'grafana-admin-password'
          value: grafanaAdminPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'grafana'
          image: grafanaImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'GF_SECURITY_ADMIN_USER'
              value: grafanaAdminUser
            }
            {
              name: 'GF_SECURITY_ADMIN_PASSWORD'
              secretRef: 'grafana-admin-password'
            }
            {
              name: 'GF_SERVER_HTTP_PORT'
              value: '3000'
            }
            {
              name: 'GF_AUTH_ANONYMOUS_ENABLED'
              value: 'false'
            }
            {
              name: 'GF_DATABASE_TYPE'
              value: 'sqlite3'
            }
            {
              name: 'GF_LOG_MODE'
              value: 'console'
            }
            {
              name: 'GF_LOG_LEVEL'
              value: 'info'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                port: 3000
                path: '/api/health'
                scheme: 'HTTP'
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              timeoutSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                port: 3000
                path: '/api/health'
                scheme: 'HTTP'
              }
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
              successThreshold: 1
            }
            {
              type: 'Startup'
              httpGet: {
                port: 3000
                path: '/api/health'
                scheme: 'HTTP'
              }
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 10
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
}

output GRAFANA_FQDN string = grafanaApp.properties.configuration.ingress.fqdn
output GRAFANA_URL string = 'https://${grafanaApp.properties.configuration.ingress.fqdn}'
output CONTAINER_APP_NAME string = grafanaApp.name
