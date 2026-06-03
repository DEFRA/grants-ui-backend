import * as path from 'node:path'
import { DockerComposeEnvironment, Wait } from 'testcontainers'

let environment

export default async function globalSetup() {
  console.log('Resolving compose file path...')
  const composeFilePath = path.resolve(path.dirname('..'))
  console.log(`Compose path: ${composeFilePath}`)

  console.log('Creating DockerComposeEnvironment...')
  const dockerEnv = new DockerComposeEnvironment(composeFilePath, 'compose.yml')
    // Inject the test token/secret env vars from .env.test so the backend container
    // uses the same values the tests sign/encrypt with (see auth-constants.js). This
    // overrides the simple defaults defined in compose.yml.
    .withEnvironmentFile('.env.test')
    // Use health-check based wait strategies for services that define a healthcheck.
    // The default strategy (Wait.forListeningPorts) waits for *every* bound host port,
    // which hangs for localstack because it publishes the dynamic 4510-4559 range that
    // it never actually binds, causing the whole setup to time out.
    .withWaitStrategy('mongodb-1', Wait.forHealthCheck())
    .withWaitStrategy('localstack-1', Wait.forHealthCheck())
    .withWaitStrategy('grants-config-broker-1', Wait.forHealthCheck())
    .withWaitStrategy('mongo-ready-1', Wait.forOneShotStartup())
    .withWaitStrategy(
      'grants-ui-backend-1',
      Wait.forLogMessage('Server started successfully').withStartupTimeout(120000)
    )

  console.log('Starting containers with up()...')
  try {
    environment = await dockerEnv.up()
    console.log('Containers started successfully.')
  } catch (err) {
    console.error('Error starting containers:', err)
    throw err
  }

  const grantsUiContainer = environment.getContainer('grants-ui-backend-1')
  const mappedPort = grantsUiContainer.getMappedPort(3001)
  process.env.API_URL = `http://localhost:${mappedPort}`

  const mongoContainer = environment.getContainer('mongodb-1')
  const mappedMongoPort = mongoContainer.getMappedPort(27017)
  // directConnection=true is required: the replica set advertises its member as
  // "mongodb:27017", which is only resolvable inside the compose network. Without
  // a direct connection the driver tries to reach that host from the host machine
  // and the client connect hangs.
  process.env.MONGO_URI = `mongodb://localhost:${mappedMongoPort}/grants-ui-backend?directConnection=true`

  // Expose the LocalStack edge endpoint so integration tests can drive the
  // config-ingest pipeline directly (seed S3 objects, enqueue SQS messages).
  // Compose binds 4566, but testcontainers remaps it to a random host port.
  const localstackContainer = environment.getContainer('localstack-1')
  const mappedAwsPort = localstackContainer.getMappedPort(4566)
  process.env.AWS_ENDPOINT_URL = `http://localhost:${mappedAwsPort}`

  // export environment for teardown
  global.__DOCKER_ENVIRONMENT__ = environment
}
