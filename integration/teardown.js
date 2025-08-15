export default async function globalTeardown() {
  console.log('Tearing down Docker environment...')
  const environment = global.__DOCKER_ENVIRONMENT__
  if (environment) {
    await environment.down()
  }
}
