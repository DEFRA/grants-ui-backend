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
