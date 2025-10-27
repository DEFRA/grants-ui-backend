# grants-ui-backend

Core delivery platform Node.js Backend Template.

- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Local development](#local-development)
  - [Docker Compose (recommended)](#docker-compose-recommended)
  - [Local Node environment](#local-node-environment)
    - [Setup](#setup)
    - [Environment configuration](#environment-configuration)
    - [Development](#development)
    - [Testing](#testing)
    - [Production](#production)
    - [Npm scripts](#npm-scripts)
    - [Update dependencies](#update-dependencies)
    - [Formatting](#formatting)
      - [Windows prettier issue](#windows-prettier-issue)
- [OpenAPI Specification](#openapi-specification)
- [Development helpers](#development-helpers)
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

## Requirements

### Node.js

Please install [Node.js](http://nodejs.org/) `>= v22` and [npm](https://nodejs.org/) `>= v10`. You will find it
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

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

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
