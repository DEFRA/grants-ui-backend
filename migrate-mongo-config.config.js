import { config as baseConfig } from './src/config.js'

const mongoConfig = baseConfig.get('mongoConfig')

const config = {
  mongodb: {
    url: mongoConfig.uri,
    databaseName: `${mongoConfig.databaseName} - config`,
    options: {}
  },
  migrationsDir: 'migrations/config',
  changelogCollectionName: 'config__changelog',
  lockCollectionName: 'config__changelog_lock',
  lockTtl: 90,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm'
}

export default config
