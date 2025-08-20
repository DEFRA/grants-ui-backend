import { validateLogCode } from './log-code-validator.js'

export const LogCodes = {
  STATE: {
    STATE_DELETE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to delete application state | userId=${messageOptions.userId} | businessId=${messageOptions.businessId} | grantId=${messageOptions.grantId} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    },
    STATE_RETRIEVE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to retrieve application state | userId=${messageOptions.userId} | businessId=${messageOptions.businessId} | grantId=${messageOptions.grantId} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    },
    STATE_SAVE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to retrieve application state | userId=${messageOptions.userId} | businessId=${messageOptions.businessId} | grantId=${messageOptions.grantId} | grantVersion=${messageOptions.grantVersion} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    }
  },
  AUTH: {
    TOKEN_VERIFICATION_SUCCESS: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Server auth token verified successfully | path=${messageOptions.path} | method=${messageOptions.method}`
    },
    TOKEN_VERIFICATION_FAILURE: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Server auth token invalid | errorName: ${messageOptions.errorName} | errorMessage: ${messageOptions.errorMessage} | stack: ${messageOptions.stack || 'N/A'} "`
    },
    AUTH_DEBUG: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `Auth debug for path=${messageOptions.path}: isAuthenticated=${messageOptions.isAuthenticated}, strategy=${messageOptions.strategy}, mode=${messageOptions.mode}, hasCredentials=${messageOptions.hasCredentials}, hasToken=${messageOptions.hasToken}, hasProfile=${messageOptions.hasProfile}, userAgent=${messageOptions.userAgent}, referer=${messageOptions.referer}, queryParams=${JSON.stringify(messageOptions.queryParams)}, authError=${messageOptions.authError}`
    }
  },

  SYSTEM: {
    ENV_CONFIG_DEBUG: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `Environment configuration: ${messageOptions.configType} - ${JSON.stringify(messageOptions.configValues)}`
    },
    SERVER_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) => `Server error occurred: ${messageOptions.error}`
    },
    STARTUP_PHASE: {
      level: 'info',
      messageFunc: (messageOptions) => `Startup phase: ${messageOptions.phase} - ${messageOptions.status}`
    },
    PLUGIN_REGISTRATION: {
      level: 'debug',
      messageFunc: (messageOptions) => `Plugin registration: ${messageOptions.pluginName} - ${messageOptions.status}`
    },
    SYSTEM_STARTUP: {
      level: 'info',
      messageFunc: (messageOptions) => `System startup completed on port=${messageOptions.port}`
    },
    SYSTEM_SHUTDOWN: {
      level: 'info',
      messageFunc: () => `System shutdown initiated`
    }
  }
}

// Validate all log codes once at startup
export const validateLogCodes = (logCodes) => {
  Object.values(logCodes).forEach((entry) => {
    Object.entries(entry).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        throw new Error('logCode must be a non-empty object')
      }

      // Check if this is a leaf node (has level and messageFunc) or a nested node
      if (typeof value === 'object' && value !== null) {
        if ('level' in value || 'messageFunc' in value) {
          // This is a leaf node, check that it has both required properties
          if (!('level' in value && 'messageFunc' in value)) {
            throw new Error(`Invalid log code definition for "${key}": Missing "level" or "messageFunc"`)
          }

          try {
            validateLogCode(value)
          } catch (e) {
            throw new Error(`Invalid log code definition for "${key}": ${e.message}`)
          }
        } else {
          // This is a nested node, recursively validate it
          validateLogCodes({ [key]: value })
        }
      } else {
        throw new Error(`Invalid log code definition for "${key}": unexpected value type`)
      }
    })
  })
}

// Validate log codes at startup
try {
  validateLogCodes(LogCodes)
} catch (error) {
  throw new Error(`Log code validation failed: ${error.message}`)
}
