import * as path from 'node:path'
import { DockerComposeEnvironment, Wait } from 'testcontainers'

let environment

export default async function globalSetup() {
  console.log('Resolving compose file path...')
  const composeFilePath = path.resolve(path.dirname('..'))
  console.log(`Compose path: ${composeFilePath}`)

  console.log('Creating DockerComposeEnvironment...')
  const dockerEnv = new DockerComposeEnvironment(
    composeFilePath,
    'compose.yml'
  ).withWaitStrategy(
    'grants-ui-backend',
    Wait.forLogMessage('Server started successfully').withStartupTimeout(30000)
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
  process.env.MONGO_URI = `mongodb://localhost:${mappedMongoPort}/grants-ui-backend`

  // export environment for teardown
  global.__DOCKER_ENVIRONMENT__ = environment
}
