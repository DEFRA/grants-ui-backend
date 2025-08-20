export default {
  rootDir: '.',
  verbose: true,
  resetModules: true,
  clearMocks: true,
  silent: false,
  testEnvironment: 'node',
  testMatch: ['**/integration/**/*.int.test.js'], // only integration tests
  reporters: ['default', ['github-actions', { silent: false }], 'summary'],
  transform: { '^.+\\.js$': 'babel-jest' },
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1'
  },
  transformIgnorePatterns: [`node_modules/(?!${['@defra/hapi-tracing', 'node-fetch'].join('|')}/)`],
  globalSetup: '<rootDir>/integration/setup.js', // your Docker Compose + wait strategy
  globalTeardown: '<rootDir>/integration/teardown.js',
  collectCoverage: false // usually skip coverage for integration tests
}
