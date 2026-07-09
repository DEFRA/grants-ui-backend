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
  - [Config ingestion from grants-config-broker](#config-ingestion-from-grants-config-broker)
  - [Mongo configuration](#mongo-configuration)
  - [Database migrations](#database-migrations)
  - [Grant version (semver)](#grant-version-semver)
  - [MongoDB Locks](#application-locking)
  - [Application purge](#application-purge)
  - [Proxy](#proxy)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [HTTP clients (recommended)](#http-clients-recommended)
  - [Files](#files)
  - [Environments](#environments)
  - [Generating tokens](#generating-tokens)
  - [Running requests](#running-requests)
  - [Keeping the requests up to date](#keeping-the-requests-up-to-date)
- [Postman Collection (deprecated)](#postman-collection-deprecated)
  - [Getting Started](#getting-started)
  - [Service-to-Service Authentication](#service-to-service-authentication)
  - [Lock-header](#generating-an-application-lock-header)
  - [Lock-release-header](#generating-an-application-lock-release-header)
  - [Usage](#usage)
  - [Keeping the Collection Updated](#keeping-the-collection-updated)
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

Please install [Node.js](http://nodejs.org/) version 24 or higher and [npm](https://nodejs.org/) `=v11.x.x` (the project is routinely tested with npm v11). The exact minimum version requirement is specified in `package.json` (`engines.node`). You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd grants-ui-backend
nvm use
```

## Local development

### Docker Compose (recommended)

For a self-contained local environment, use the provided Compose file:

```bash
docker compose up --build
```

This builds the development image and starts the full local stack defined in `compose.yml`:

- `grants-ui-backend` – this service
- `grants-config-broker` – source of grant form definitions (pulls the `defradigital/grants-config-broker:latest` image)
- `mongodb` – MongoDB running as a single-node replica set (`mongoRepl`), with a `mongo-ready` init container that waits for the replica set to be available
- `localstack` – local AWS emulation (S3, SQS, SNS, Firehose) used by the config ingestion module

The backend is available on <http://localhost:3001> by default. Stop the stack with:

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

Create your environment configuration file. You can use the provided example as a template:

```bash
cp env.example.sh .env
```

**Required variables** for local development:

- `MONGO_URI` – address of your MongoDB instance (default: `mongodb://127.0.0.1:27017`)
- `GRANTS_UI_BACKEND_AUTH_TOKEN` – 64 character lowercase hexadecimal string (generate with `openssl rand -hex 32`)
- `GRANTS_UI_BACKEND_ENCRYPTION_KEY` – 64 character lowercase hexadecimal string (generate with `openssl rand -hex 32`)
- `APPLICATION_LOCK_TOKEN_SECRET` – 64 character lowercase hexadecimal string (generate with `openssl rand -hex 32`)

**Optional MongoDB configuration** (sensible defaults are provided):

- `MONGO_DATABASE` – state database name (default: `grants-ui-backend`)
- `MONGO_MAX_POOL_SIZE` / `MONGO_CONFIG_MAX_POOL_SIZE` – maximum connection pool size (default: `25`)
- `MONGO_MIN_POOL_SIZE` / `MONGO_CONFIG_MIN_POOL_SIZE` – minimum connection pool size (default: `5`)
- `MONGO_MAX_IDLE_TIME_MS` / `MONGO_CONFIG_MAX_IDLE_TIME_MS` – idle connection timeout in milliseconds (default: `60000`)

**Grants config broker** (source of form definitions, see [Config ingestion from grants-config-broker](#config-ingestion-from-grants-config-broker)):

- `CONFIG_BROKER_BASE_URL` – base URL of the grants-config-broker API
- `GRANTS_CONFIG_BROKER_AUTH_TOKEN` – plain bearer token expected by the broker
- `GRANTS_CONFIG_BROKER_ENCRYPTION_KEY` – AES-256-GCM key used to encrypt the broker bearer token
- `CONFIG_BROKER_REQUEST_TIMEOUT_MS` – HTTP timeout for broker requests (default: `15000`)

**AWS / LocalStack** (used by the config ingestion S3 + SQS clients):

- `AWS_REGION` – AWS region (default: `eu-west-2`)
- `AWS_ENDPOINT_URL` – AWS endpoint URL override (set to the LocalStack endpoint locally, e.g. `http://localhost:4566`)

**SQS config ingestion** (consumer of grants-config-broker SNS notifications):

- `CONFIG_INGEST_SQS_QUEUE_URL` – SQS queue URL subscribed to the config-broker SNS topic. When unset, the SQS consumer does not start.
- `CONFIG_INGEST_SQS_WAIT_TIME_SECONDS` – SQS long-poll wait time in seconds (default: `20`)
- `CONFIG_INGEST_SQS_MAX_MESSAGES` – maximum SQS messages per poll (default: `10`)
- `CONFIG_INGEST_SQS_VISIBILITY_TIMEOUT_SECONDS` – SQS visibility timeout per poll batch (default: `30`)

**Application lock configuration** (required for lock-protected routes):

- `APPLICATION_LOCK_TOKEN_SECRET` – secret key for signing lock tokens (64 character hex string, generate with `openssl rand -hex 32`)
- `APPLICATION_LOCK_TTL_MS` – lock timeout in milliseconds (default: `14400000` - 4 hours)

**Application purge configuration** (optional):

Used to mark obsolete unsubmitted applications as `PURGED` during service startup following a grant major-version change.

- `PURGE_UNSUBMITTED_APPLICATIONS` – semicolon-separated list of grant/version rules

Examples:

```bash
# Purge all FFC applications older than 2.0.0
PURGE_UNSUBMITTED_APPLICATIONS=ffc:<2.0.0

# Purge exactly version 1.5.0
PURGE_UNSUBMITTED_APPLICATIONS=ffc:1.5.0

# Multiple grants
PURGE_UNSUBMITTED_APPLICATIONS=ffc:<2.0.0;sfi:1.5.0
```

Version matching uses standard semantic-version (semver) range expressions.

Examples:

| Rule             | Meaning                           |
| ---------------- | --------------------------------- |
| `1.5.0`          | Exactly version 1.5.0             |
| `<2.0.0`         | Any version older than 2.0.0      |
| `>3.0.1`         | Any version newer than 3.0.1      |
| `^2.1.0`         | Any compatible 2.x version        |
| `~2.1.0`         | Patch releases within 2.1.x       |
| `>=2.0.0 <3.0.0` | Any version in the 2.x major line |

Purged applications are not deleted from MongoDB. Instead, their
`state.applicationStatus` is updated to `PURGED` so the frontend can
display a reset journey and prompt the applicant to start a new application.

An extended reference with all available configuration options is available in `env.example.sh`.

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

**Common development scripts:**

- `npm run dev` – Run the application in development mode with auto-reload
- `npm run dev:debug` – Run in development mode with debugger breakpoint support
- `npm start` – Run the application in production mode
- `npm test` – Run unit tests with coverage
- `npm run test:watch` – Run tests in watch mode
- `npm run test:integration` – Run integration tests (requires Docker)
- `npm run lint` – Check code for linting errors
- `npm run lint:fix` – Automatically fix linting errors
- `npm run format` – Auto-format code with Prettier
- `npm run format:check` – Check code formatting without making changes
- `npm run generate:auth-header` – Generate Bearer token for API authentication
- `npm run generate:lock-header` – Generate lock token for application lock-protected routes
- `npm run generate:lock-release-header` – Generate lock release token for application lock release route
- `npm run generate:env` – Generate local HTTP client JWT headers into `http/http-client.private.env.json` (no `.env` required)

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

The service exposes a live documentation endpoint alongside the static spec file.

### Documentation UI

When the service is running, an interactive Swagger UI is available at:

```
http://localhost:3001/documentation
```

The OpenAPI specification is also available as JSON at:

```
http://localhost:3001/swagger.json
```

Both endpoints are unauthenticated at the application level. In deployed non-production environments the CDP platform requires an `x-api-key` header to reach any endpoint:

```bash
curl --header 'x-api-key: <cdp-api-key>' \
  'https://grants-ui-backend.dev.cdp-int.defra.cloud/documentation'
```

To browse the Swagger UI in a browser on a deployed instance, use a browser extension that injects custom request headers and add `x-api-key: <cdp-api-key>` before navigating to the `/documentation` URL.

The docs are not accessible in production because CDP does not issue API keys for the production environment.

### Spec file

The authoritative OpenAPI 3.1 specification lives at the repository root:

- File: [openapi.yaml](./openapi.yaml)

It can be viewed with any OpenAPI-compatible tool (e.g. the Swagger Viewer extension for VS Code, or natively in IntelliJ). The live `/swagger.json` endpoint serves this file directly, so the two are always in sync.

### Keeping the spec up-to-date

When you add or change routes (see [src/plugins/router.js](./src/plugins/router.js) and the module route files), update `openapi.yaml` accordingly. The HTTP clients and the spec should be kept in step — see [Keeping the requests up to date](#keeping-the-requests-up-to-date).

## Development helpers

### Structured logging

Application logs follow the shared, code-driven format used by the Grants UI frontend. Log codes live in `src/common/helpers/logging/log-codes.js` and are validated on startup; unit tests exist alongside the helpers (`src/common/helpers/logging/*.test.js`). When introducing new log codes, mirror the approach described in the [frontend structured logging guide](https://github.com/DEFRA/grants-ui#structured-logging-system) and update the relevant tests.

### Application state and frontend rehydration

Mongo documents written to the `state__grant_application_state` collection are rehydrated by the frontend during user journeys. Review the [frontend session rehydration documentation](https://github.com/DEFRA/grants-ui#session-rehydration) before modifying stored shapes or lifecycle expectations, and update the OpenAPI schema plus Postman collection accordingly.

### Config ingestion from grants-config-broker

Grant form definitions are sourced from the [grants-config-broker](https://github.com/DEFRA) and ingested into MongoDB (the `config__form_definitions` collection in the config database). Ingestion happens in two ways:

- **Startup pull** – on boot the service fetches all grant versions from the broker (`GET /api/allGrants` via `CONFIG_BROKER_BASE_URL`) and ingests each one (`runStartupPull`).
- **Ongoing updates** – the broker publishes change notifications to an SNS topic, which fans out to an SQS queue. The SQS consumer reads messages, fetches the corresponding YAML manifests from S3, transforms them, and upserts the definitions into Mongo.

The SQS consumer only runs when `CONFIG_INGEST_SQS_QUEUE_URL` is set; if it is unset the consumer does not start (useful when only the startup pull is required). Locally, S3, SQS and SNS are emulated by LocalStack and the broker is provided by the Docker Compose stack — see [Docker Compose (recommended)](#docker-compose-recommended). The relevant environment variables are listed under [Environment configuration](#environment-configuration).

### Mongo configuration

The service connects to a single MongoDB database as required by CDP as there is a 1-to-1 mapping between service and database, howvever there are separate mongo plugins and server decorations for `mongoState` (application state, submissions and locks) and `mongoConfig` (grant form definitions).
Both share the same `MONGO_` environment variables (see `src/common/helpers/convict/mongo-schema.js`). Sensible defaults are provided for local development.

- `MONGO_URI` (default: `mongodb://127.0.0.1:27017`)
- `MONGO_DATABASE` (default: `grants-ui-backend`) — database name
- `MONGO_MAX_POOL_SIZE` (default: `25`) — maximum connections in the pool
- `MONGO_MIN_POOL_SIZE` (default: `5`) — minimum connections to keep in the pool
- `MONGO_MAX_IDLE_TIME_MS` (default: `60000`) — idle connection timeout in milliseconds

### Database migrations

This service uses [migrate-mongo](https://github.com/seppevs/migrate-mongo) to manage MongoDB schema migrations. Migrations run automatically on startup via `runMigrations()` (`src/common/helpers/run-migrations.js`) and are tracked in prefixed changelog collections within the shared MongoDB database — so each migration runs exactly once, regardless of how many times the server restarts.

Although `mongoState` and `mongoConfig` are two separate logical databases (each with its own Hapi plugin and server decoration), CDP's 1-to-1 service-to-database constraint means both connect to the **same physical MongoDB database**. To avoid collection name collisions, the changelog collections are namespaced with a prefix:

| Logical database       | Changelog collection | Lock collection          |
| ---------------------- | -------------------- | ------------------------ |
| State (`mongoState`)   | `state__changelog`   | `state__changelog_lock`  |
| Config (`mongoConfig`) | `config__changelog`  | `config__changelog_lock` |

When the service runs as multiple instances (e.g. several ECS tasks behind a rolling deploy), migrations are serialized across instances:

- **Cross-instance serialization** — migrate-mongo's built-in lock collection (enabled by setting `lockTtl > 0` in both config files) ensures exactly one instance applies pending migrations per logical database. Non-winning instances poll with back-off until the lock clears, then start normally.
- **Fail-loud startup** — a genuine migration error is rethrown and crashes boot, so CDP/ECS health checks catch a broken instance rather than treating a failed migration as healthy.
- **Duplicate-apply backstop** — a unique index on `fileName` in each changelog collection guards against double-applying a migration.
- **Index creation is owned by migrations** — index definitions live in dedicated `*-create-indexes.js` migrations (one per logical database) rather than being created at app boot.
- **Structured logging** — migration outcomes are logged via the shared `LogCodes.MIGRATIONS` codes: `APPLIED` (info, when migrations were applied), `NONE_PENDING` (debug, when the database is already up to date) and `LOCKED_RETRY` (info, when another instance holds the lock). `NONE_PENDING` only surfaces when the deployed log level allows `debug`.

Each logical database has its own migrations folder and config file:

| Logical database       | Config file                      | Migrations folder    |
| ---------------------- | -------------------------------- | -------------------- |
| State (`mongoState`)   | `migrate-mongo-config.state.js`  | `migrations/state/`  |
| Config (`mongoConfig`) | `migrate-mongo-config.config.js` | `migrations/config/` |

#### Adding a new migration

Use the npm scripts to scaffold a new migration file in the correct folder:

```bash
# For the state database
npm run migrate:state:create -- my-migration-name

# For the config database
npm run migrate:config:create -- my-migration-name
```

This creates a timestamped file (e.g. `migrations/state/20240101120000-my-migration-name.js`) with empty `up` and `down` functions. Fill in the `up` body with your migration logic; `down` is optional but useful for local rollback.

### Grant version (semver)

`grantVersion` is always a [semver](https://semver.org/) string of the form `x.y.z` (e.g. `1.0.0`). It is part of the identity of a grant application across state documents, submissions and locks.

Input contract:

- When omitted from a request, `grantVersion` defaults to `'1.0.0'`.
- A non-semver value (e.g. an integer `1`, or a malformed string) is rejected by Joi validation in `src/modules/state/state.schema.js` with a `400` response — the value is validated against `Joi.string().pattern(/^\d+\.\d+\.\d+$/)`.
- Locks, state and submissions always persist `grantVersion` as a semver string.

The state migration `migrations/state/20260603163942-use-semver.js` performs a one-way data normalisation: it rewrites any legacy `grantVersion` values (e.g. integers) to semver strings and, on state documents, decomposes the version into `pinnedMajor` / `major` / `minor` / `patch` fields used for version-aware querying. Its `down` is an intentional no-op — to roll back, restore the database from a backup.

### Application locking

This service enforces exclusive application access to grant applications using a MongoDB-backed locking mechanism.

Locks are scoped to a single application, identified by:

- `grantCode`
- `grantVersion`
- `sbi` (Single Business Identifier)

Only one user from a given business may view/edit a given application at a time.

### Application purge

The backend supports startup-time purging of obsolete unsubmitted applications.

This mechanism is intended for grant scheme changes that invalidate draft applications created against earlier versions of a form definition.

When the service is configured with `PURGE_UNSUBMITTED_APPLICATIONS` it evaluates the configured rules during startup.

Matching application state records:

- must belong to the specified grant
- must match the configured semver rule
- must not already be submitted
- are marked with `applicationStatus: 'PURGED'`

Purged applications remain in MongoDB for audit and operational purposes. They are not physically deleted.

Example:

```bash
PURGE_UNSUBMITTED_APPLICATIONS=ffc:<2.0.0
```

The version rules are supported through node.js semver so all of the following are supported:

```
<1.2.0
<=1.2.0
>1.2.0
>=1.2.0
1.x
1.2.x
^1.2.0
~1.2.0
1.0.0 - 2.0.0
```

This marks all unsubmitted `ffc` applications created against versions older than `2.0.0` as `PURGED`.

The operation is designed to be idempotent. Running the same purge multiple times has no additional effect on already-purged applications.

In multi-instance deployments (for example ECS rolling deployments), multiple instances may execute the startup purge logic. Because purge updates are idempotent, repeated execution is safe.

#### How locking works

Lock-protected routes require a JWT token in the `x-application-lock-owner` header. This token identifies the user attempting to acquire the lock and includes the application scope (SBI, grantCode, grantVersion).

When a request enters a route protected by the application lock pre-handler, the backend:

1. Extracts and validates the lock token from the `x-application-lock-owner` header
2. Attempts to acquire or refresh a lock for the authenticated user
3. Refreshes the lock if the same user already holds it
4. Blocks access if another user holds an active lock

Locks are **time-limited** (TTL-based) and automatically expire if the user becomes inactive. The default TTL is 4 hours, configurable via `APPLICATION_LOCK_TTL_MS`.

If a lock expires, it can be taken over by another user.

**Lock token format:**

The lock token is a JWT containing:

- `sub` – User identifier (DefraID user ID)
- `sbi` – Single Business Identifier
- `grantCode` – Grant application code
- `grantVersion` – Grant scheme version (semver string `x.y.z`, see [Grant version (semver)](#grant-version-semver))
- `typ` – Token type (must be `'lock'`)

Generate lock tokens using `npm run generate:lock-header` (see [Generating an Application Lock Header](#generating-an-application-lock-header)).

#### Enforcement

Locking is enforced at the request level using a Hapi pre-handler:

```js
options: {
  pre: [{ method: enforceApplicationLock }]
}
```

If another user holds the lock, the request is rejected with:

- HTTP 423 – Locked
- Message: Another applicant is currently editing this application

#### Storage

Lock state is stored in MongoDB in the `state__grant_application_locks` collection.

Each lock document contains:

- application identifiers (grantCode, grantVersion, sbi)
- ownerId (DefraID user identifier)
- lockedAt
- expiresAt

A unique index ensures only one active lock exists per application.

#### Notes

- Lock acquisition is atomic and safe under concurrent access.
- Lock contention is treated as an expected condition, not an error.
- Lock release on submission or sign-out is handled at route / workflow level and is out of scope for this section.

### Grant allowlist

The allowlist controls which users can access which grants. The config broker uploads `allowlist.yaml` files to S3 alongside each grant's form definition; this service ingests them from S3 via the config broker and applies them per environment.

#### Access rules

Access is evaluated per grant, per environment:

- Grants with **no allowlist entries** are **closed to all users**.
- Grants with `allowAll: true` are **open to all users** in that environment.
- Otherwise the user must appear in **both** the CRN list and the SBI list.

#### allowlist.yaml format

```yaml
dev:
  allowAll: true # open to everyone in dev
test:
  crns:
    - '1234567890'
  sbis:
    - '123456789'
```

The file lives at `<grantCode>/<version>/grants-ui/allowlist.yaml` inside the config S3 bucket. If the file is absent for a grant version, all entries for that grant are cleared (closing access).

#### Ingestion

Allowlist entries are ingested automatically when a grant version is published via the config broker. The backend replaces all existing entries for the grant atomically on each ingest. Results are cached in memory per `crn:sbi` pair to reduce database load.

#### Authentication

The `GET /allowlist/grants` endpoint requires:

- `Authorization: Bearer <token>` — standard service-to-service bearer token
- `x-encrypted-auth: <jwt>` — a JWT signed with `ENCRYPTED_AUTH_JWT_SECRET` containing `crn` and `sbi` claims

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

For day-to-day development, follow [Docker Compose (recommended)](#docker-compose-recommended). The service runs in the foreground by default. To run in detached mode (background), add the `-d` flag:

```bash
docker compose up --build -d
```

### Dependabot

Dependabot is configured for this repository in [.github/dependabot.yml](.github/dependabot.yml)

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties)

## HTTP clients (recommended)

HTTP clients are the **primary, recommended way to exercise and test every endpoint** in this project. The `http/` directory contains `.http` request files that work with the JetBrains HTTP client (built into IntelliJ/WebStorm) and the VS Code [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension. They are version-controlled alongside the code, cover both the backend and the grants-config-broker, and have their tokens populated automatically by a single npm script.

### Files

- `http/grants-ui-backend.http` – requests for this backend: health check, application `state` save/get/delete/patch, `submissions`, the admin application-lock release, and `DELETE /application-locks` (release all locks for an owner).
- `http/grants-config-broker.http` – requests against the grants-config-broker: `GET /api/allGrants`, `GET /api/version`, and `GET /api/latestVersion`.
- `http/http-client.env.json` – public, checked-in environment variables (`backendBaseUrl`, `configBrokerBaseUrl`) for the `local` and `dev` environments.
- `http/http-client.private.env.json` – generated secrets/tokens (`backendAuthToken`, `applicationLockOwnerToken`, `applicationLockReleaseToken`, `configBrokerAuthToken`, etc.). This file is produced by `npm run generate:env` and must **not** be committed.

### Environments

`http/http-client.env.json` defines two environments:

- `local` – points at `http://localhost:3001` (backend) and `http://localhost:3012` (config-broker), matching the [Docker Compose (recommended)](#docker-compose-recommended) stack.
- `dev` – points at the deployed `dev` CDP environment.

Select the environment in your editor when sending a request (for example, the environment dropdown in the JetBrains HTTP client or the env picker in the VS Code REST Client).

### Generating tokens

Before making requests for the `local` environment, generate the private tokens:

```bash
npm run generate:env
```

This runs `scripts/generatePrivateEnv.js`, which writes all required Bearer and lock tokens into `http/http-client.private.env.json`. It does **not** require a `.env` file — it derives the values it needs directly. Re-run it whenever the underlying secrets or the lock-scope variables (`grantCode`, `grantVersion`, `sbi`, `userId`) at the top of `grants-ui-backend.http` change.

### Running requests

1. Start the local stack (see [Docker Compose (recommended)](#docker-compose-recommended)) or run the backend with `npm run dev`.
2. Run `npm run generate:env` to populate the private tokens.
3. Open `http/grants-ui-backend.http` or `http/grants-config-broker.http`, select the `local` (or `dev`) environment, and send any request using the in-editor "run" gutter action.

The `.http` files reference the public and private environment variables (e.g. `{{backendBaseUrl}}`, `{{backendAuthToken}}`, `{{applicationLockOwnerToken}}`), so no manual copy-pasting of tokens is needed.

### Keeping the requests up to date

The HTTP clients are the source of truth for manual API testing, so keep them current:

- When you add or change an endpoint, **update the relevant `.http` file** (`grants-ui-backend.http` or `grants-config-broker.http`) so the request collection stays complete.
- For backend API changes, also update [openapi.yaml](./openapi.yaml) so the specification and the HTTP clients stay in sync (see [OpenAPI Specification](#openapi-specification)).

## Postman Collection (deprecated)

> **Deprecated.** The Postman collection is retained for users who still rely on it, but it is **no longer the recommended way to test the API** — use the [HTTP clients](#http-clients-recommended) instead. The files under `postman/` should **not** be updated going forward; reflect any API changes in the `.http` clients and, for the backend, in [openapi.yaml](./openapi.yaml).

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

1. Setup your plain, secret value (GRANTS_UI_BACKEND_AUTH_TOKEN) and encrypt/decrypt key (GRANTS_UI_BACKEND_ENCRYPTION_KEY) in your environment variables (see `env.example.sh` for reference):

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

### Generating an Application Lock Header

Some requests require a Lock Token (state operations) to acquire or release an application lock. This header is generated locally using a Node script. The admin delete application lock does not require lock token.

#### Environment variables

For local testing with Postman, set these environment variables in your `.env` file (these are separate from the backend service configuration):

```
APPLICATION_LOCK_TOKEN_SECRET=<64-character hex key>
USER_ID=<user-id-of-the-user-holding-the-token>
SBI=<sbi-holding-the-token>
GRANT_CODE=<grant-code-holding-the-token>
GRANT_VERSION=<grant-version-holding-the-token>
```

**Note:** `APPLICATION_LOCK_TOKEN_SECRET` must match the value configured in the backend service. The other variables (USER_ID, SBI, GRANT_CODE, GRANT_VERSION) are only needed for generating test tokens and should match the application you're testing.

#### Generate the Lock Token

Run the npm script:

```
npm run generate:lock-header
```

This outputs a header in the format:

```
x-application-lock-owner: <lock-token>
```

Copy this token and include it in your Postman requests to endpoints that require application locks.

Script location:

```
scripts/generateLockHeader.js
```

### Generating an Application Lock Release Header

In addition to TTL-based expiry, application locks may be explicitly released when a user signs out or otherwise exits the application flow.

Lock release is performed via a dedicated endpoint and **does not use the application-scoped lock token**.

#### Lock release authentication

Lock release requests must include a JWT in the `x-application-lock-release` header.

This token:

- Identifies the user only (`ownerId`)
- Is **not scoped** to a specific application
- Is used solely for releasing locks owned by that user
- Has a distinct token type (e.g. `typ: 'lock-release'`)

#### Release semantics

When a valid lock-release token is presented, the backend:

1. Verifies the token and extracts `ownerId`
2. Deletes all active application locks owned by that user
3. Returns the number of released locks

This operation is idempotent.

> Note: Lock release tokens are intentionally distinct from application lock tokens and must not be used for lock acquisition or enforcement.

#### Generate the Lock Release Token (Sign-out)

Run the npm script:

```
npm run generate:lock-release-header
```

This outputs a header in the format:

```
x-application-lock-release: <release-token>
```

Use this header when calling:

```
DELETE /application-locks
```

This endpoint releases all application locks held by the authenticated user, typically during sign-out.

Script location:

```
scripts/generateLockReleaseHeader.js
```

### Usage

- **Send Requests**:
  Once imported, you can navigate through the requests in the collection and send them directly to the API.

- **Customize Variables**:
  If using an environment file, adjust variables like `base_url` to match your local or deployed API instance.

### Keeping the Collection Updated

The Postman collection under `/postman/` is **deprecated and no longer maintained**. It is not kept in step with API changes — those are reflected in the [HTTP clients](#http-clients-recommended) and, for the backend, in [openapi.yaml](./openapi.yaml). Do not edit the files under `/postman/`; prefer the HTTP clients for any new or updated requests.

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
