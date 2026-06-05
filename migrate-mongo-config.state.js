import { config as baseConfig } from './src/config.js'

const mongoState = baseConfig.get('mongoState')

const config = {
  mongodb: {
    url: mongoState.uri,
    databaseName: mongoState.databaseName,
    options: {}
  },
  migrationsDir: 'migrations/state',
  changelogCollectionName: 'changelog',
  lockCollectionName: 'changelog_lock',
  lockTtl: 90,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm'
}

export default config
