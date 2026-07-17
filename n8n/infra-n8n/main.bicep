targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment; used to derive resource names.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@secure()
@description('PostgreSQL administrator password. Provided via azd env / main.parameters.json.')
param postgresPassword string

@secure()
@description('n8n encryption key. Auto-generated if not provided.')
param n8nEncryptionKey string = newGuid()

@description('n8n container image, pinned to a tested tag.')
param n8nImage string = 'docker.io/n8nio/n8n:2.30.6'

var abbrs = loadJsonContent('abbreviations.json')
var resourceToken = uniqueString(subscription().id, environmentName, location)
var tags = {
  'azd-env-name': environmentName
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
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
    postgresPassword: postgresPassword
    n8nEncryptionKey: n8nEncryptionKey
    n8nImage: n8nImage
  }
}

output N8N_URL string = resources.outputs.N8N_URL
output N8N_CONTAINER_APP_NAME string = resources.outputs.N8N_CONTAINER_APP_NAME
output RESOURCE_GROUP_NAME string = rg.name
output AZURE_LOCATION string = location
