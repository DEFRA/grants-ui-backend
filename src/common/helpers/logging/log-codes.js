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
  APPLICATION_LOCK: {
    ACQUIRED: {
      level: 'debug',
      messageFunc: ({ sbi, ownerId, grantCode, grantVersion }) =>
        `Acquired application lock | sbi=${sbi} | ownerId=${ownerId} | grantCode=${grantCode} | grantVersion=${grantVersion}`
    },
    ACQUISITION_FAILED: {
      level: 'error',
      messageFunc: ({ sbi, ownerId, grantCode, grantVersion, stack }) =>
        `Failed to acquire application lock | sbi=${sbi} | ownerId=${ownerId} | grantCode=${grantCode} | grantVersion=${grantVersion} | stack=${stack}`
    },
    RELEASE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to release application lock | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    },
    RELEASED: {
      level: 'info',
      messageFunc: ({ sbi, ownerId, grantCode, grantVersion }) =>
        `Released application lock | sbi=${sbi} | ownerId=${ownerId} | grantCode=${grantCode} | grantVersion=${grantVersion}`
    },
    LOCK_TOKEN_MISSING: {
      level: 'warn',
      messageFunc: ({ path, method }) => `Missing application lock token | path=${path} | method=${method}`
    },
    LOCK_TOKEN_INVALID: {
      level: 'warn',
      messageFunc: ({ path, method, errorName, errorMessage }) =>
        `Invalid application lock token | path=${path} | method=${method} | errorName=${errorName} | errorMessage=${errorMessage}`
    },
    LOCK_TOKEN_WRONG_TYPE: {
      level: 'warn',
      messageFunc: ({ path, method, typ }) =>
        `Invalid application lock token type | path=${path} | method=${method} | typ=${typ}`
    },
    LOCK_TOKEN_MISSING_USER_IDENTITY: {
      level: 'warn',
      messageFunc: ({ path, method, userId }) =>
        `Missing required lock token user identity claim | path=${path} | method=${method} | userId=${userId}`
    },
    LOCK_TOKEN_MISSING_SBI: {
      level: 'warn',
      messageFunc: ({ path, method, sbi }) =>
        `Missing required lock token SBI claim | path=${path} | method=${method} | sbi=${sbi}`
    },
    LOCK_TOKEN_MISSING_GRANT_CODE: {
      level: 'warn',
      messageFunc: ({ path, method, grantCode }) =>
        `Missing required lock token grant code claim | path=${path} | method=${method} | grantCode=${grantCode}`
    },
    LOCK_TOKEN_INVALID_VERSION: {
      level: 'warn',
      messageFunc: ({ path, method, grantVersion }) =>
        `Invalid grantVersion in lock token | path=${path} | method=${method} | grantVersion=${grantVersion}`
    },
    LOCK_CONFLICT: {
      level: 'info',
      messageFunc: ({ path, method, sbi, grantCode, ownerId }) =>
        `Application lock conflict | path=${path} | method=${method} | sbi=${sbi} | grantCode=${grantCode} | ownerId=${ownerId}`
    }
  },
  APPLICATION_LOCKS: {
    RELEASE_FAILED: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Failed to release application locks | ownerId=${messageOptions.ownerId} | errorName=${messageOptions.errorName} | errorMessage=${messageOptions.errorMessage} | errorReason=${messageOptions.errorReason} | errorCode=${messageOptions.errorCode} | isMongoError=${messageOptions.isMongoError} | stack=${messageOptions.stack}`
    },
    RELEASED: {
      level: 'info',
      messageFunc: ({ ownerId, releasedCount }) => `Released ${releasedCount} application locks for owner ${ownerId}`
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
