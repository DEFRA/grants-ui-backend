import { config as baseConfig } from './src/config.js'

const mongoConfig = baseConfig.get('mongoConfig')

const config = {
  mongodb: {
    url: mongoConfig.uri,
    databaseName: mongoConfig.databaseName,
    options: {}
  },
  migrationsDir: 'migrations/config',
  changelogCollectionName: 'changelog',
  lockCollectionName: 'changelog_lock',
  lockTtl: 90,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm'
}

export default config
