# grants-ui-backend

Core delivery platform Node.js Backend Template.

- [Related documentation](#related-documentation)
- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Local development](#local-development)
  - [Docker Compose (recommended)](#docker-compose-recommended)
  - [Local Node environment](#local-node-environment)
    - [Setup](#setup)
    - [Environment configuration](#environment-configuration)
    - [Development](#development)
    - [Testing](#testing)
    - [Git hooks](#git-hooks)
    - [Production](#production)
    - [Npm scripts](#npm-scripts)
    - [Update dependencies](#update-dependencies)
    - [Formatting](#formatting)
      - [Windows prettier issue](#windows-prettier-issue)
- [OpenAPI Specification](#openapi-specification)
- [Development helpers](#development-helpers)
  - [Structured logging](#structured-logging)
  - [Application state and frontend rehydration](#application-state-and-frontend-rehydration)
  - [Mongo configuration](#mongo-configuration)
  - [MongoDB Locks](#mongodb-locks)
  - [Proxy](#proxy)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Postman Collection](#postman-collection)
  - [Getting Started](#getting-started)
  - [Service-to-Service Authentication](#service-to-service-authentication)
  - [Usage](#usage)
  - [Keeping the Collection Updated](#keeping-the-collection-updated)
- [Example Folder Structure](#example-folder-structure)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Related documentation

This service works alongside the [grants-ui frontend](https://github.com/DEFRA/grants-ui). That README captures the end-to-end user journey and shared engineering practices. Useful companion sections include:

- [DXT Forms Engine Plugin](https://github.com/DEFRA/grants-ui#dxt-forms-engine-plugin) – how journeys are composed and which payloads this backend receives
- [Session Rehydration](https://github.com/DEFRA/grants-ui#session-rehydration) – lifecycle of state stored in MongoDB by this service
- [Structured Logging System](https://github.com/DEFRA/grants-ui#structured-logging-system) – log code conventions shared across UI and backend services
- [Analytics](https://github.com/DEFRA/grants-ui#analytics) – how application telemetry is captured on the frontend, complementing the events emitted here

Use this README for backend-specific setup; refer to the frontend README when you need context about journeys, shared tooling, or logging standards.

## Requirements

### Node.js

Please install [Node.js](http://nodejs.org/) `>= v24` and [npm](https://nodejs.org/) `=v11.x.x` (the project is routinely tested with npm v11). You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd grants-ui-backend
nvm use
```

## Local development

### Docker Compose (recommended)

For a self-contained local environment (service plus MongoDB), use the provided Compose file:

```bash
docker compose up --build
```

This builds the development image and starts the dependencies defined in `compose.yml`. The backend is available on <http://localhost:3001> by default. Stop the stack with:

```bash
docker compose down
```

To spin up the full stack with the frontend, follow the [Docker guidance in grants-ui](https://github.com/DEFRA/grants-ui#docker).

### Local Node environment

If you prefer to run the application directly on your machine, follow the steps below.

#### Setup

Install application dependencies:

```bash
npm install
```

#### Environment configuration

Copy the sample environment file and update the required variables:

```bash
cp .env.local .env
```

Set values for:

- `MONGO_URI` – address of your MongoDB instance (the default assumes a local database on port 27017)
- `GRANTS_UI_BACKEND_AUTH_TOKEN` – 64 character lowercase hexadecimal string (generate with `openssl rand -hex 32`)
- `GRANTS_UI_BACKEND_ENCRYPTION_KEY` – 64 character lowercase hexadecimal string (generate with `openssl rand -hex 32`)

An extended reference is available in `env.example.sh`.

Keep these values in sync with the frontend configuration described in the [grants-ui environment guidance](https://github.com/DEFRA/grants-ui#environment-variables) so clients can authenticate successfully.

#### Development

To run the application in `development` mode run:

```bash
npm run dev
```

#### Testing

To test the application run:

```bash
npm run test
```

Integration tests rely on Docker (via Testcontainers) and can be run with:

```bash
npm run test:integration
```

The frontend documents complementary UI testing patterns in its [testing framework section](https://github.com/DEFRA/grants-ui#testing-framework).

#### Git hooks

Husky installs a pre-commit hook during `npm install`. The hook runs `npm run format:check`, `npm run lint`, and `npm test`, mirroring the workflow in [grants-ui](https://github.com/DEFRA/grants-ui). If commits are blocked:

- run `npm run setup:husky` to reinstall the hooks
- address formatting or lint failures with `npm run lint:fix`
- fix failing tests locally before committing

#### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

#### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json).
To view them in your command line run:

```bash
npm run
```

#### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
npx npm-check-updates --interactive --format group
```

#### Formatting

##### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## OpenAPI Specification

An OpenAPI 3.1 specification is available at the repository root:

- File: [openapi.yaml](./openapi.yaml)

How to view it:

- Use any OpenAPI viewer or IDE plugin/extension (e.g. Swagger Viewer for VS Code or natively in IntelliJ).

Keeping the spec up-to-date:

- When you add or change routes (see src/plugins/router.js and src/routes/\*), update openapi.yaml accordingly.

## Development helpers

### Structured logging

Application logs follow the shared, code-driven format used by the Grants UI frontend. Log codes live in `src/common/helpers/logging/log-codes.js` and are validated on startup; unit tests exist alongside the helpers (`src/common/helpers/logging/*.test.js`). When introducing new log codes, mirror the approach described in the [frontend structured logging guide](https://github.com/DEFRA/grants-ui#structured-logging-system) and update the relevant tests.

### Application state and frontend rehydration

Mongo documents written to the `grant-application-state` collection are rehydrated by the frontend during user journeys. Review the [frontend session rehydration documentation](https://github.com/DEFRA/grants-ui#session-rehydration) before modifying stored shapes or lifecycle expectations, and update the OpenAPI schema plus Postman collection accordingly.

### Mongo configuration

The service’s MongoDB connection can be tuned via the following environment variables (see `src/config.js`). Sensible defaults are provided for local development, so you only need to override them when required by your environment or performance profile.

- `MONGO_URI` (default: `mongodb://127.0.0.1:27017`)
  Connection string for your MongoDB deployment.

- `MONGO_DATABASE` (default: `grants-ui-backend`)
  Database name used by the service.

- `MONGO_MAX_POOL_SIZE` (default: `25`)
  Maximum number of connections in the client pool.

- `MONGO_MIN_POOL_SIZE` (default: `5`)
  Minimum number of connections to keep in the pool.

- `MONGO_MAX_IDLE_TIME_MS` (default: `60000`)
  How long an idle connection may remain in the pool before being closed, in milliseconds.

### MongoDB Locks

If you require a write lock for Mongo you can acquire it via `server.locker` or `request.locker`:

```javascript
async function doStuff(server) {
  const lock = await server.locker.lock('unique-resource-name')

  if (!lock) {
    // Lock unavailable
    return
  }

  try {
    // do stuff
  } finally {
    await lock.free()
  }
}
```

Keep it small and atomic.

You may use **using** for the lock resource management.
Note test coverage reports do not like that syntax.

```javascript
async function doStuff(server) {
  await using lock = await server.locker.lock('unique-resource-name')

  if (!lock) {
    // Lock unavailable
    return
  }

  // do stuff

  // lock automatically released
}
```

Helper methods are also available in `src/common/helpers/mongo-lock.js`.

### Proxy

We are using forward-proxy which is set up by default. To make use of this: `import { fetch } from 'undici'` then
because of the `setGlobalDispatcher(new ProxyAgent(proxyUrl))` calls will use the ProxyAgent Dispatcher

If you are not using Wreck, Axios or Undici or a similar http that uses `Request`. Then you may have to provide the
proxy dispatcher:

To add the dispatcher to your own client:

```javascript
import { ProxyAgent } from 'undici'

return await fetch(url, {
  dispatcher: new ProxyAgent({
    uri: proxyUrl,
    keepAliveTimeout: 10,
    keepAliveMaxTimeout: 10
  })
})
```

The frontend relies on the same proxy configuration; see its [proxy documentation](https://github.com/DEFRA/grants-ui#proxy) if you are troubleshooting cross-repo HTTP behaviour.

## Docker

### Development image

Build:

```bash
docker build --target development --no-cache --tag grants-ui-backend:development .
```

Run:

```bash
docker run \
  -e PORT=3001 \
  -p 3001:3001 \
  grants-ui-backend:development
```

Set any additional environment variables required by your deployment (see [Environment configuration](#environment-configuration)).

### Production image

Build:

```bash
docker build --no-cache --tag grants-ui-backend .
```

Run:

```bash
docker run \
  -e PORT=3001 \
  -p 3001:3001 \
  grants-ui-backend
```

Set any additional environment variables required by your deployment (see [Environment configuration](#environment-configuration)).

### Docker Compose

For day-to-day development, follow [Docker Compose (recommended)](#docker-compose-recommended). For reference, the same command is shown below:

```bash
docker compose up --build -d
```

### Dependabot

Dependabot is configured for this repository in [.github/dependabot.yml](.github/dependabot.yml)

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties)

## Postman Collection

The project includes a Postman collection to make it easier to test and interact with the API. This collection contains pre-configured requests for various endpoints and an environment file to manage variables like API URLs.

### Getting Started

1. **Install Postman**
   If you don’t already have Postman installed, download it from [Postman’s official site](https://www.postman.com/).

2. **Import the Collection**
   - Open Postman.
   - Go to **File > Import**.
   - Select the file `postman/grants-ui-backend.postman_collection.json`.

3. **Import the Environment (Optional)**
   If the project includes an environment file:
   - Go to **File > Import**.
   - Select the file `postman/grants-ui-backend.dev.postman_environment.json`.
   - Update variables like `base_url`, `api_key` or `grant_type` as needed.

4. **Set the Active Environment**
   - In Postman, click on the environment dropdown in the top right corner.
   - Select the imported environment (e.g., `dev`).

### Service-to-Service Authentication

The API uses AES-256-GCM encrypted tokens with Bearer Authentication.

#### Generating the Authorization Header

1. Setup your plain, secret value (GRANTS_UI_BACKEND_AUTH_TOKEN) and encrypt/decrypt key (GRANTS_UI_BACKEND_ENCRYPTION_KEY) in your `.env` (see also `.env.local`):

```
GRANTS_UI_BACKEND_AUTH_TOKEN=<your token>
GRANTS_UI_BACKEND_ENCRYPTION_KEY=<your encryption key>
```

2. Use the npm script to generate the Bearer token:

```bash
npm run generate:auth-header
```

Copy the output `Authorization: Bearer ...` header and use it in Postman under the `grants-ui-backend-bearer_token` in Environments tab for your requests.

⚠️ Make sure the environment variables match what the backend config expects.

### Usage

- **Send Requests**:
  Once imported, you can navigate through the requests in the collection and send them directly to the API.

- **Customize Variables**:
  If using an environment file, adjust variables like `base_url` to match your local or deployed API instance.

### Keeping the Collection Updated

The Postman collection is maintained in the repository under the `/postman/` directory. If the API changes, the collection will be updated accordingly. Pull the latest changes from the repository to ensure you have the most up-to-date collection.

### Example Folder Structure

```

project-root/
├── postman/
│ ├── grants-ui-backend.postman_collection.json
│ ├── grants-ui-backend.local.postman_environment.json
│ ├── grants-ui-backend.dev.postman_environment.json
│ └── grants-ui-backend.test.postman_environment.json
├── scripts/
│ └── generateHeader.js
```

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
