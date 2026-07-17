targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment; used to derive resource names.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('Resource group name. Defaults to rg-<environmentName>.')
param resourceGroupName string = 'rg-${environmentName}'

@description('PostgreSQL administrator login.')
param postgresAdminUser string = 'supersetadmin'

@secure()
@description('PostgreSQL administrator password (pinned via azd env).')
param postgresPassword string

var tags = {
  'azd-env-name': environmentName
  journey: 'superset'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'superset-resources'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    tags: tags
    postgresAdminUser: postgresAdminUser
    postgresPassword: postgresPassword
  }
}

output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_LOCATION string = location
output AZURE_AKS_CLUSTER_NAME string = resources.outputs.aksClusterName
output POSTGRES_HOST string = resources.outputs.postgresHost
output POSTGRES_DATABASE string = resources.outputs.postgresDatabase
output POSTGRES_USER string = resources.outputs.postgresUser
