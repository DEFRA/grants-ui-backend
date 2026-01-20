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

# Application lock configuration
APPLICATION_LOCK_TOKEN_SECRET=  # 64-char hex string. Generate: openssl rand -hex 32. Must match value used by frontend/client
APPLICATION_LOCK_TTL_MS=14400000  # Lock timeout in milliseconds (default: 4 hours)
