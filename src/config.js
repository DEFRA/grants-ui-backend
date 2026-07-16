import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

import { convictValidateMongoUri } from './common/helpers/convict/validate-mongo-uri.js'
import { mongoStateSchema } from './common/helpers/convict/mongo-state-schema.js'
import { mongoConfigSchema } from './common/helpers/convict/mongo-config-schema.js'

convict.addFormat(convictValidateMongoUri)
convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

const oneHourMs = 3600000
const fourHoursMs = oneHourMs * 4

const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind',
    format: 'port',
    default: 3001,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'grants-ui-backend'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: ['local', 'infra-dev', 'management', 'dev', 'test', 'perf-test', 'ext-test', 'prod'],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  isSecureContextEnabled: {
    doc: 'Enable Secure Context',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_METRICS'
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  auth: {
    token: {
      doc: 'Bearer token for service-to-service authentication',
      format: String,
      default: '',
      env: 'GRANTS_UI_BACKEND_AUTH_TOKEN',
      sensitive: true
    },
    encryptionKey: {
      doc: 'Encryption key for decrypting bearer token',
      format: String,
      default: '',
      env: 'GRANTS_UI_BACKEND_ENCRYPTION_KEY',
      sensitive: true
    }
  },
  mongoState: mongoStateSchema,
  mongoConfig: mongoConfigSchema,
  configBroker: {
    baseUrl: {
      doc: 'Base URL of the grants-config-broker API',
      format: String,
      default: '',
      env: 'CONFIG_BROKER_BASE_URL'
    },
    authToken: {
      doc: 'Plain bearer token expected by the grants-config-broker',
      format: String,
      default: '',
      env: 'GRANTS_CONFIG_BROKER_AUTH_TOKEN',
      sensitive: true
    },
    encryptionKey: {
      doc: 'AES-256-GCM key used to encrypt the broker bearer token',
      format: String,
      default: '',
      env: 'GRANTS_CONFIG_BROKER_ENCRYPTION_KEY',
      sensitive: true
    },
    requestTimeoutMs: {
      doc: 'HTTP timeout for broker requests',
      format: Number,
      default: 15_000,
      env: 'CONFIG_BROKER_REQUEST_TIMEOUT_MS'
    }
  },
  aws: {
    region: {
      doc: 'AWS region',
      format: String,
      default: 'eu-west-2',
      env: 'AWS_REGION'
    },
    endpointUrl: {
      doc: 'AWS endpoint URL override (used for Floci)',
      format: String,
      nullable: true,
      default: '',
      env: 'AWS_ENDPOINT_URL'
    }
  },
  configIngest: {
    sqsQueueUrl: {
      doc: 'SQS queue URL subscribed to the config-broker SNS topic',
      format: String,
      default: '',
      env: 'CONFIG_INGEST_SQS_QUEUE_URL'
    },
    sqsWaitTimeSeconds: {
      doc: 'SQS long-poll wait time in seconds',
      format: Number,
      default: 20,
      env: 'CONFIG_INGEST_SQS_WAIT_TIME_SECONDS'
    },
    sqsMaxMessages: {
      doc: 'Maximum SQS messages per poll',
      format: Number,
      default: 10,
      env: 'CONFIG_INGEST_SQS_MAX_MESSAGES'
    },
    sqsVisibilityTimeoutSeconds: {
      doc: 'SQS visibility timeout per poll batch',
      format: Number,
      default: 30,
      env: 'CONFIG_INGEST_SQS_VISIBILITY_TIMEOUT_SECONDS'
    }
  },
  grantsUiBaseUrl: {
    doc: 'Base URL of the Grants UI frontend, used to construct grant URLs',
    format: String,
    default: '',
    env: 'GRANTS_UI_BASE_URL'
  },
  encryptedAuthJwtSecret: {
    doc: 'Secret used to verify the x-encrypted-auth JWT sent by grants-ui',
    format: String,
    default: '',
    env: 'ENCRYPTED_AUTH_JWT_SECRET',
    sensitive: true
  },
  applicationLock: {
    secret: {
      doc: 'Secret used to verify application lock tokens',
      format: String,
      default: '',
      env: 'APPLICATION_LOCK_TOKEN_SECRET',
      sensitive: true
    },
    ttlMs: {
      doc: 'Application lock timeout in milliseconds',
      format: Number,
      default: fourHoursMs,
      env: 'APPLICATION_LOCK_TTL_MS'
    }
  },
  purge: {
    applications: {
      doc: 'Semicolon-separated purge rules, e.g. "ffc:<2.0.0;sfi:1.5.0"',
      format: String,
      default: '',
      env: 'PURGE_UNSUBMITTED_APPLICATIONS'
    }
  }
})

config.validate({ allowed: 'strict' })

export { config }
