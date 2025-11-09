import { validateLogCode } from './log-code-validator.js'

export const LogCodes = {
  STATE: {
    STATE_PAYLOAD_SIZE: {
      level: 'info',
      messageFunc: (messageOptions) => `Received payload | size=${messageOptions.payloadSize}`
    },
    STATE_PAYLOAD_SIZE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Large payload approaching limit | size=${messageOptions.payloadSize} | threshold=${messageOptions.threshold} | max=${messageOptions.max} | path=${messageOptions.path}}`
    },
    STATE_DELETE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to delete application state | sbi=${messageOptions.sbi} | grantCode=${messageOptions.grantCode} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    },
    STATE_RETRIEVE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to retrieve application state | sbi=${messageOptions.sbi} | grantCode=${messageOptions.grantCode} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    },
    STATE_SAVE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to retrieve application state | sbi=${messageOptions.sbi} | grantCode=${messageOptions.grantCode} | grantVersion=${messageOptions.grantVersion} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    },
    STATE_PATCH_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to patch application state | sbi=${messageOptions.sbi} | grantCode=${messageOptions.grantCode} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
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
  },
  SUBMISSIONS: {
    SUBMISSIONS_PAYLOAD_SIZE: {
      level: 'info',
      messageFunc: (messageOptions) => `Received payload | size=${messageOptions.payloadSize}`
    },
    SUBMISSIONS_PAYLOAD_SIZE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Large payload approaching limit | size=${messageOptions.payloadSize} | threshold=${messageOptions.threshold} | max=${messageOptions.max} | path=${messageOptions.path}}`
    },
    SUBMISSIONS_RETRIEVE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to retrieve submissions | crn=${messageOptions.crn} | sbi=${messageOptions.sbi} | grantCode=${messageOptions.grantCode} | grantVersion=${messageOptions.grantVersion} | referenceNumber=${messageOptions.referenceNumber} | submittedAt=${messageOptions.submittedAt} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    },
    SUBMISSIONS_ADD_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to add submission | crn=${messageOptions.crn} | sbi=${messageOptions.sbi} | grantCode=${messageOptions.grantCode} | grantVersion=${messageOptions.grantVersion} | referenceNumber=${messageOptions.referenceNumber} | submittedAt=${messageOptions.submittedAt} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    }
  },
  SEED: {
    SEED_STARTED: {
      level: 'info',
      messageFunc: () => `Seed operation started`
    },
    SEED_COLLECTION_CLEARED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Collection cleared | collection=${messageOptions.collection} | deletedCount=${messageOptions.deletedCount}`
    },
    SEED_COLLECTION_INSERTED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Collection seeded | collection=${messageOptions.collection} | insertedCount=${messageOptions.insertedCount}`
    },
    SEED_COMPLETED: {
      level: 'info',
      messageFunc: (messageOptions) => `Seed operation completed | totalInserted=${messageOptions.totalInserted}`
    },
    SEED_FILE_READ_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to read seed file | filePath=${messageOptions.filePath} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | stack=${messageOptions.stack}`
    },
    SEED_PARSE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to parse JSONL | filePath=${messageOptions.filePath} | lineNumber=${messageOptions.lineNumber} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | stack=${messageOptions.stack}`
    },
    SEED_OPERATION_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Seed operation failed | collection=${messageOptions.collection} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
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
