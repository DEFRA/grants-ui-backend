export default {
  rootDir: '.',
  verbose: true,
  resetModules: true,
  clearMocks: true,
  silent: false,
  preset: '@shelf/jest-mongodb',
  watchPathIgnorePatterns: ['globalConfig'],
  globalSetup: '<rootDir>/node_modules/@shelf/jest-mongodb/lib/setup.js',
  globalTeardown: '<rootDir>/node_modules/@shelf/jest-mongodb/lib/teardown.js',
  testEnvironment: '<rootDir>/node_modules/@shelf/jest-mongodb/lib/environment.js',
  testMatch: ['**/contracts/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/.jest/setup-files-after-env.js'],
  reporters: ['default', ['github-actions', { silent: false }], 'summary'],
  transform: { '^.+\\.js$': 'babel-jest' },
  transformIgnorePatterns: [`node_modules/(?!${['@defra/hapi-tracing', 'node-fetch'].join('|')}/)`]
}
