targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment; used to tag and namespace resources.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('Optional name of an existing resource group to deploy into. Defaults to rg-<environmentName>.')
param resourceGroupName string = ''

@description('gpt-5-mini model version available in the target region (see: az cognitiveservices model list).')
param chatModelVersion string = '2025-08-07'

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
  name: 'aimarket-resources'
  scope: rg
  params: {
    location: location
    tags: tags
    abbrs: abbrs
    resourceToken: resourceToken
    chatModelVersion: chatModelVersion
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output RESOURCE_GROUP_NAME string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.AZURE_CONTAINER_REGISTRY_ENDPOINT
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.AZURE_CONTAINER_REGISTRY_NAME
output API_URL string = resources.outputs.API_URL
output WEB_URL string = resources.outputs.WEB_URL
output API_CONTAINER_APP_NAME string = resources.outputs.API_CONTAINER_APP_NAME
output WEB_CONTAINER_APP_NAME string = resources.outputs.WEB_CONTAINER_APP_NAME
output AZURE_SEARCH_ENDPOINT string = resources.outputs.AZURE_SEARCH_ENDPOINT
output AZURE_OPENAI_ENDPOINT string = resources.outputs.AZURE_OPENAI_ENDPOINT
