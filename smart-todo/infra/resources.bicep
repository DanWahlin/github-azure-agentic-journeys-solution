@description('Azure region for all resources.')
param location string

@description('Tags applied to every resource.')
param tags object

@description('Deterministic token used to build globally unique resource names.')
param resourceToken string

@description('Resource name abbreviations.')
param abbrs object

@description('Object ID of the deploying user (Microsoft Entra).')
param principalId string

@description('Microsoft Entra login of the deploying user; used as the Azure SQL Entra administrator.')
param principalLogin string

@description('Principal type of the deploying identity.')
param principalType string

@description('AI chat model deployment name.')
param aiDeploymentName string

@description('AI chat model version.')
param aiModelVersion string

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
var storageAccountName = '${abbrs.storageAccount}${resourceToken}'
var logAnalyticsName = '${abbrs.logAnalyticsWorkspace}${resourceToken}'
var appInsightsName = '${abbrs.applicationInsights}${resourceToken}'
var planName = '${abbrs.appServicePlan}${resourceToken}'
var functionAppName = '${abbrs.functionApp}${resourceToken}'
var sqlServerName = '${abbrs.sqlServer}${resourceToken}'
var sqlDatabaseName = 'smarttodo'
var aiServicesName = '${abbrs.cognitiveServices}${resourceToken}'
var deploymentContainerName = 'deploymentpackage'

// Built-in role definition IDs
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// ---------------------------------------------------------------------------
// Monitoring: Log Analytics + Application Insights
// ---------------------------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
  }
}

// ---------------------------------------------------------------------------
// Storage account (Functions host + Flex Consumption deployment package)
// ---------------------------------------------------------------------------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    networkAcls: {
      // Flex Consumption zip upload (azd deploy) requires Allow, not Deny.
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
    supportsHttpsTrafficOnly: true
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

// Pre-create the deployment package container so azd deploy never fails with
// "The specified container does not exist" on first deploy.
resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

// ---------------------------------------------------------------------------
// Microsoft Foundry (Azure AI Services) + gpt-5-mini deployment
// ---------------------------------------------------------------------------
resource aiServices 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: aiServicesName
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: aiServicesName
    publicNetworkAccess: 'Enabled'
    // Default path uses AZURE_AI_KEY with the plain openai SDK.
    disableLocalAuth: false
  }
}

// Use a nested deployment boundary so the model PUT cannot race the account's
// asynchronous transition to a terminal provisioning state.
module gptDeployment 'ai-model-deployment.bicep' = {
  name: 'ai-model-${resourceToken}'
  params: {
    aiServicesName: aiServices.name
    deploymentName: aiDeploymentName
    modelVersion: aiModelVersion
  }
}

// ---------------------------------------------------------------------------
// Azure SQL (Entra-only auth) + Basic database
// ---------------------------------------------------------------------------
resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  tags: tags
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      login: principalLogin
      sid: principalId
      tenantId: tenant().tenantId
      principalType: principalType
      azureADOnlyAuthentication: true
    }
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  properties: {
    // Basic tier max is 2 GB; default 32 GB exceeds the limit.
    maxSizeBytes: 2147483648
    // Basic tier does not support zone redundancy.
    zoneRedundant: false
  }
}

// Allow other Azure services (the Function App) to reach the server.
resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------------------------------------------------------------------------
// Function App on Flex Consumption
// ---------------------------------------------------------------------------
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  tags: union(tags, {
    'azd-service-name': 'api'
  })
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 100
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'node'
        version: '24'
      }
    }
    siteConfig: {
      appSettings: [
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          // Identity-based host storage; no connection string / access key.
          name: 'AzureWebJobsStorage__accountName'
          value: storage.name
        }
        {
          name: 'AZURE_AI_ENDPOINT'
          value: aiServices.properties.endpoint
        }
        {
          name: 'AZURE_AI_DEPLOYMENT'
          value: aiDeploymentName
        }
        {
          name: 'AZURE_AI_KEY'
          value: aiServices.listKeys().key1
        }
        {
          // Full FQDN, not the short name (avoids getaddrinfo ENOTFOUND).
          name: 'AZURE_SQL_SERVER'
          value: sqlServer.properties.fullyQualifiedDomainName
        }
        {
          name: 'AZURE_SQL_DATABASE'
          value: sqlDatabaseName
        }
      ]
    }
  }
  dependsOn: [
    deploymentContainer
    gptDeployment
  ]
}

// ---------------------------------------------------------------------------
// Role assignments
// ---------------------------------------------------------------------------
// Function App identity -> Storage Blob Data Owner (Flex Consumption deploy + host).
resource funcStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, storageBlobDataOwnerRoleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Deploying user -> Storage Blob Data Contributor (azd deploy zip upload).
resource userStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, principalId, storageBlobDataContributorRoleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: principalId
    principalType: principalType
  }
}

// ---------------------------------------------------------------------------
// Outputs (SCREAMING_SNAKE_CASE for azd env)
// ---------------------------------------------------------------------------
output API_URL string = 'https://${functionApp.properties.defaultHostName}'
output FUNCTION_APP_NAME string = functionApp.name
output SQL_SERVER_NAME string = sqlServer.name
output SQL_DATABASE_NAME string = sqlDatabaseName
output AZURE_AI_ENDPOINT string = aiServices.properties.endpoint
output AZURE_AI_DEPLOYMENT string = aiDeploymentName
