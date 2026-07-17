targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment; used to derive resource names and tags.')
param environmentName string

@minLength(1)
@description('Primary Azure region for all resources.')
param location string

@description('Grafana admin username.')
param grafanaAdminUser string = 'admin'

@secure()
@description('Grafana admin password. Provided securely via azd env / parameters; never echoed.')
param grafanaAdminPassword string

@description('Grafana container image.')
param grafanaImage string = 'docker.io/grafana/grafana:11.3.0'

var abbrs = loadJsonContent('abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
}

resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
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
    grafanaAdminUser: grafanaAdminUser
    grafanaAdminPassword: grafanaAdminPassword
    grafanaImage: grafanaImage
  }
}

output GRAFANA_URL string = resources.outputs.GRAFANA_URL
output GRAFANA_FQDN string = resources.outputs.GRAFANA_FQDN
output GRAFANA_ADMIN_USER string = grafanaAdminUser
output RESOURCE_GROUP_NAME string = rg.name
output CONTAINER_APP_NAME string = resources.outputs.CONTAINER_APP_NAME
output AZURE_LOCATION string = location
