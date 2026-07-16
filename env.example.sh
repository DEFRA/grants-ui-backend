# Config for grants-ui-backend, settings should be in KEY=value format

# Service configuration
SERVICE_VERSION=
HOST=0.0.0.0
PORT=3001
ENVIRONMENT=local

# Logging configuration
LOG_ENABLED=true
LOG_LEVEL=debug
LOG_FORMAT=pino-pretty

# MongoDB configuration
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DATABASE=grants-ui-backend

# Proxy configuration
HTTP_PROXY=

# Security settings
ENABLE_SECURE_CONTEXT=false
ENABLE_METRICS=false

# Tracing
TRACING_HEADER=x-cdp-request-id

# Service-to-service authentication
GRANTS_UI_BACKEND_AUTH_TOKEN=  # 64-char alphanumeric string (no capitals). Generate: openssl rand -hex 32
GRANTS_UI_BACKEND_ENCRYPTION_KEY=  # 64-char alphanumeric string. Generate: openssl rand -hex 32

# Grants Config Broker — source of form definitions
CONFIG_BROKER_BASE_URL=http://localhost:3012
GRANTS_CONFIG_BROKER_AUTH_TOKEN=config-broker-auth-token
GRANTS_CONFIG_BROKER_ENCRYPTION_KEY=config-broker-encryption-key
CONFIG_BROKER_REQUEST_TIMEOUT_MS=15000

# AWS / Floci (used by config module SQS + S3)
AWS_REGION=eu-west-2
AWS_ENDPOINT_URL=http://floci:4566

# SQS consumer for grants-config-broker SNS notifications
CONFIG_INGEST_SQS_QUEUE_URL=http://floci:4566/000000000000/grants_ui_backend__sqs__config_updates
CONFIG_INGEST_SQS_WAIT_TIME_SECONDS=20
CONFIG_INGEST_SQS_MAX_MESSAGES=10
CONFIG_INGEST_SQS_VISIBILITY_TIMEOUT_SECONDS=30

# Application lock configuration
APPLICATION_LOCK_TOKEN_SECRET=  # 64-char hex string. Generate: openssl rand -hex 32. Must match value used by frontend/client
APPLICATION_LOCK_TTL_MS=14400000  # Lock timeout in milliseconds (default: 4 hours)

# Semicolon-separated list of grantCode:versionRule entries
#
# Examples:
#   PURGE_UNSUBMITTED_APPLICATIONS=ffc:<2.0.0
#   PURGE_UNSUBMITTED_APPLICATIONS=ffc:<2.0.0;sfi:1.5.0
#   PURGE_UNSUBMITTED_APPLICATIONS=ffc:^2.1.0
#
# Version rules follow standard semver range syntax.
PURGE_UNSUBMITTED_APPLICATIONS=