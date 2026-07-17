targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment; used to derive resource names and tags.')
param environmentName string

@minLength(1)
@description('Primary Azure region for all resources.')
param location string

@description('Object ID of the deploying user (Microsoft Entra). azd populates AZURE_PRINCIPAL_ID.')
param principalId string

@description('Microsoft Entra login (UPN or display name) of the deploying user; used as the Azure SQL Entra administrator.')
param principalLogin string

@description('Principal type of the deploying identity for role assignments and SQL admin.')
@allowed([
  'User'
  'ServicePrincipal'
  'Group'
])
param principalType string = 'User'

@description('Name of the resource group to create/use for all resources.')
param resourceGroupName string = ''

@description('AI model deployment (chat) name exposed to the API.')
param aiDeploymentName string = 'gpt-5-mini'

@description('AI model version. westus requires 2025-08-07 for gpt-5-mini.')
param aiModelVersion string = '2025-08-07'

var abbrs = loadJsonContent('abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: !empty(resourceGroupName) ? resourceGroupName : '${abbrs.resourceGroup}${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    abbrs: abbrs
    principalId: principalId
    principalLogin: principalLogin
    principalType: principalType
    aiDeploymentName: aiDeploymentName
    aiModelVersion: aiModelVersion
  }
}

output API_URL string = resources.outputs.API_URL
output FUNCTION_APP_NAME string = resources.outputs.FUNCTION_APP_NAME
output SQL_SERVER_NAME string = resources.outputs.SQL_SERVER_NAME
output SQL_DATABASE_NAME string = resources.outputs.SQL_DATABASE_NAME
output AZURE_AI_ENDPOINT string = resources.outputs.AZURE_AI_ENDPOINT
output AZURE_AI_DEPLOYMENT string = resources.outputs.AZURE_AI_DEPLOYMENT
output RESOURCE_GROUP_NAME string = rg.name
output AZURE_LOCATION string = location
