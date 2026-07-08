# Repository Guidelines

## Project Structure & Module Organization

Application code lives in `src/`. Configuration is in `src/config.js`, plugins are under `src/plugins/`, routes are under `src/routes/`, migrations are in `src/migrations/`, and shared test helpers are in `src/test-helpers/`. Tests are colocated as `*.test.js`.

## Build, Test, and Development Commands

- `npm install`: install dependencies and set up Husky.
- `npm run dev`: run the backend in development mode.
- `npm start`: start the production server.
- `npm test`: run the test suite.
- `npm run lint` / `npm run lint:fix`: check or fix linting.
- `npm run format:check` / `npm run format`: check or apply formatting when available.

## Coding Style & Naming Conventions

Use ES modules and the local lint/format settings. Keep route, plugin, migration, and helper names descriptive, and preserve existing auth/header terminology when touching request contracts.

## Domain Language

Use `CONTEXT.md` as the source of truth for Grants UI Backend persistence and identity language. Prefer those terms in APIs, tests, docs, and generated changes.

## Developer Addenda

Developers can add their own `AGENTS.local.md` and should be read as an addendum to this file. Keep that file local to your machine and do not commit it.

## Testing Guidelines

Add or update colocated unit tests for route, plugin, and migration changes. Run the narrowest relevant test first, then broader test and lint commands.

## Security & Configuration Tips

Do not commit secrets, private HTTP client files, or local database credentials. Generated Pact files and localstack artifacts should remain disposable.
