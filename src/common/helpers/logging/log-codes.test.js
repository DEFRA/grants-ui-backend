import { LogCodes, validateLogCodes } from './log-codes.js'

// Test constants
const TEST_USER_IDS = {
  DEFAULT: 'test',
  CONTACT_ID: '12345'
}

const TEST_PATHS = {
  ADMIN: '/admin',
  AUTH_SIGN_IN_OIDC: '/auth/sign-in-oidc',
  EXAMPLE_GRANT: '/example-grant',
  TEST_PATH: '/test-path'
}

const TEST_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_TOKEN: 'Invalid token',
  NETWORK_ERROR: 'Network error',
  NO_TOKEN: 'No token provided',
  PROCESSING_FAILED: 'Processing failed',
  REQUIRED_FIELD: 'Required field missing',
  DATABASE_ERROR: 'Database connection failed',
  CONNECTION_FAILED: 'Connection failed',
  INVALID_DATA: 'Invalid data'
}

const TEST_GRANT_VERSION = {
  DEFAULT: '1.0.0'
}

const TEST_DATE_TIME = {
  DEFAULT: new Date()
}

const TEST_GRANT_TYPES = {
  EXAMPLE_GRANT_WITH_AUTH: 'example-grant-with-auth'
}

const TEST_REFERENCE_NUMBERS = {
  REF_122: 'REF122',
  REF_123: 'REF123'
}

const TEST_SBI = {
  DEFAULT: '106284736'
}

const TEST_PORTS = {
  DEFAULT: 3000
}

const TEST_METHODS = {
  GET: 'GET',
  POST: 'POST'
}

function assertLogCode(category, logCodeName, expectedLevel, testParams, expectedMessage) {
  const actualName = logCodeName.split(' ')[0]
  const logCode = LogCodes[category][actualName]
  expect(logCode.level).toBe(expectedLevel)
  expect(typeof logCode.messageFunc).toBe('function')
  expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
}

describe('LogCodes', () => {
  describe('AUTH log codes', () => {
    it.each([
      [
        'TOKEN_VERIFICATION_SUCCESS',
        'info',
        { path: TEST_PATHS.AUTH_SIGN_IN_OIDC, method: TEST_METHODS.POST },
        `Server auth token verified successfully | path=${TEST_PATHS.AUTH_SIGN_IN_OIDC} | method=${TEST_METHODS.POST}`
      ],
      [
        'TOKEN_VERIFICATION_FAILURE',
        'error',
        { errorName: TEST_ERRORS.INVALID_TOKEN, errorMessage: TEST_ERRORS.INVALID_CREDENTIALS },
        `Server auth token invalid | errorName: ${TEST_ERRORS.INVALID_TOKEN} | errorMessage: ${TEST_ERRORS.INVALID_CREDENTIALS} | stack: N/A`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      assertLogCode('AUTH', logCodeName, expectedLevel, testParams, expectedMessage)
    })

    it('should have valid AUTH_DEBUG log code', () => {
      const logCode = LogCodes.AUTH.AUTH_DEBUG
      expect(logCode.level).toBe('debug')
      expect(typeof logCode.messageFunc).toBe('function')
      const debugOptions = {
        path: TEST_PATHS.AUTH_SIGN_IN_OIDC,
        isAuthenticated: false,
        strategy: 'defra-id',
        mode: 'try',
        hasCredentials: false,
        hasToken: false,
        hasProfile: false,
        userAgent: 'Mozilla/5.0',
        referer: 'https://example.com',
        queryParams: { test: 'value' },
        authError: TEST_ERRORS.NO_TOKEN
      }
      const result = logCode.messageFunc(debugOptions)
      expect(result).toContain(`Auth debug for path=${TEST_PATHS.AUTH_SIGN_IN_OIDC}`)
      expect(result).toContain('isAuthenticated=false')
      expect(result).toContain('strategy=defra-id')
      expect(result).toContain(`authError=${TEST_ERRORS.NO_TOKEN}`)
    })
  })

  describe('STATE log codes', () => {
    it.each([
      ['STATE_PAYLOAD_SIZE', 'info', { payloadSize: 123 }, `Received payload | size=123`],
      [
        'STATE_PAYLOAD_SIZE_FAILED',
        'error',
        {
          payloadSize: 123,
          threshold: 10,
          max: 100,
          path: TEST_PATHS.EXAMPLE_GRANT
        },
        `Large payload approaching limit | size=123 | threshold=10 | max=100 | path=${TEST_PATHS.EXAMPLE_GRANT}`
      ],
      [
        'STATE_DELETE_FAILED',
        'error',
        {
          sbi: TEST_SBI.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          errorName: TEST_ERRORS.PROCESSING_FAILED,
          errorMessage: TEST_ERRORS.PROCESSING_FAILED,
          errorReason: TEST_ERRORS.PROCESSING_FAILED,
          errorCode: TEST_ERRORS.PROCESSING_FAILED,
          isMongoError: false,
          stack: 'some stack trace'
        },
        `Failed to delete application state | sbi=${TEST_SBI.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | errorName=${TEST_ERRORS.PROCESSING_FAILED} | errorMessage=${TEST_ERRORS.PROCESSING_FAILED} | errorReason=${TEST_ERRORS.PROCESSING_FAILED} | errorCode=${TEST_ERRORS.PROCESSING_FAILED} | isMongoError=false | stack=some stack trace`
      ],
      [
        'STATE_RETRIEVE_FAILED',
        'error',
        {
          sbi: TEST_SBI.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          errorName: TEST_ERRORS.PROCESSING_FAILED,
          errorMessage: TEST_ERRORS.PROCESSING_FAILED,
          errorReason: TEST_ERRORS.PROCESSING_FAILED,
          errorCode: TEST_ERRORS.PROCESSING_FAILED,
          isMongoError: false,
          stack: 'some stack trace'
        },
        `Failed to retrieve application state | sbi=${TEST_SBI.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | errorName=${TEST_ERRORS.PROCESSING_FAILED} | errorMessage=${TEST_ERRORS.PROCESSING_FAILED} | errorReason=${TEST_ERRORS.PROCESSING_FAILED} | errorCode=${TEST_ERRORS.PROCESSING_FAILED} | isMongoError=false | stack=some stack trace`
      ],
      [
        'STATE_SAVE_FAILED',
        'error',
        {
          sbi: TEST_SBI.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          grantVersion: TEST_GRANT_VERSION.DEFAULT,
          errorName: TEST_ERRORS.PROCESSING_FAILED,
          errorMessage: TEST_ERRORS.PROCESSING_FAILED,
          errorReason: TEST_ERRORS.PROCESSING_FAILED,
          errorCode: TEST_ERRORS.PROCESSING_FAILED,
          isMongoError: false,
          stack: 'some stack trace'
        },
        `Failed to save application state | sbi=${TEST_SBI.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | grantVersion=${TEST_GRANT_VERSION.DEFAULT} | errorName=${TEST_ERRORS.PROCESSING_FAILED} | errorMessage=${TEST_ERRORS.PROCESSING_FAILED} | errorReason=${TEST_ERRORS.PROCESSING_FAILED} | errorCode=${TEST_ERRORS.PROCESSING_FAILED} | isMongoError=false | stack=some stack trace`
      ],
      [
        'STATE_PATCH_FAILED',
        'error',
        {
          sbi: TEST_SBI.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          errorName: TEST_ERRORS.PROCESSING_FAILED,
          errorMessage: TEST_ERRORS.PROCESSING_FAILED,
          errorReason: TEST_ERRORS.PROCESSING_FAILED,
          errorCode: TEST_ERRORS.PROCESSING_FAILED,
          isMongoError: false,
          stack: 'some stack trace'
        },
        `Failed to patch application state | sbi=${TEST_SBI.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | errorName=${TEST_ERRORS.PROCESSING_FAILED} | errorMessage=${TEST_ERRORS.PROCESSING_FAILED} | errorReason=${TEST_ERRORS.PROCESSING_FAILED} | errorCode=${TEST_ERRORS.PROCESSING_FAILED} | isMongoError=false | stack=some stack trace`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      assertLogCode('STATE', logCodeName, expectedLevel, testParams, expectedMessage)
    })
  })

  describe('SUBMISSIONS log codes', () => {
    it.each([
      ['SUBMISSIONS_PAYLOAD_SIZE', 'info', { payloadSize: 123 }, `Received payload | size=123`],
      [
        'SUBMISSIONS_PAYLOAD_SIZE_FAILED',
        'error',
        {
          payloadSize: 123,
          threshold: 10,
          max: 100,
          path: TEST_PATHS.EXAMPLE_GRANT
        },
        `Large payload approaching limit | size=123 | threshold=10 | max=100 | path=${TEST_PATHS.EXAMPLE_GRANT}`
      ],
      [
        'SUBMISSIONS_RETRIEVE_FAILED',
        'error',
        {
          crn: 123,
          sbi: TEST_SBI.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          grantVersion: TEST_GRANT_VERSION.DEFAULT,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          submittedAt: TEST_DATE_TIME.DEFAULT,
          errorName: TEST_ERRORS.PROCESSING_FAILED,
          errorMessage: TEST_ERRORS.PROCESSING_FAILED,
          errorReason: TEST_ERRORS.PROCESSING_FAILED,
          errorCode: TEST_ERRORS.PROCESSING_FAILED,
          isMongoError: false,
          stack: 'some stack trace'
        },
        `Failed to retrieve submissions | crn=123 | sbi=${TEST_SBI.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | grantVersion=${TEST_GRANT_VERSION.DEFAULT} | referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123} | submittedAt=${TEST_DATE_TIME.DEFAULT} | errorName=${TEST_ERRORS.PROCESSING_FAILED} | errorMessage=${TEST_ERRORS.PROCESSING_FAILED} | errorReason=${TEST_ERRORS.PROCESSING_FAILED} | errorCode=${TEST_ERRORS.PROCESSING_FAILED} | isMongoError=false | stack=some stack trace`
      ],
      [
        'SUBMISSIONS_ADD_FAILED',
        'error',
        {
          crn: 123,
          sbi: TEST_SBI.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          grantVersion: TEST_GRANT_VERSION.DEFAULT,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          previousReferenceNumber: TEST_REFERENCE_NUMBERS.REF_122,
          submittedAt: TEST_DATE_TIME.DEFAULT,
          errorName: TEST_ERRORS.PROCESSING_FAILED,
          errorMessage: TEST_ERRORS.PROCESSING_FAILED,
          errorReason: TEST_ERRORS.PROCESSING_FAILED,
          errorCode: TEST_ERRORS.PROCESSING_FAILED,
          isMongoError: false,
          stack: 'some stack trace'
        },
        `Failed to add submission | crn=123 | sbi=${TEST_SBI.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | grantVersion=${TEST_GRANT_VERSION.DEFAULT} | referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123} | previousReferenceNumber=${TEST_REFERENCE_NUMBERS.REF_122} | submittedAt=${TEST_DATE_TIME.DEFAULT} | errorName=${TEST_ERRORS.PROCESSING_FAILED} | errorMessage=${TEST_ERRORS.PROCESSING_FAILED} | errorReason=${TEST_ERRORS.PROCESSING_FAILED} | errorCode=${TEST_ERRORS.PROCESSING_FAILED} | isMongoError=false | stack=some stack trace`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      assertLogCode('SUBMISSIONS', logCodeName, expectedLevel, testParams, expectedMessage)
    })
  })

  describe('APPLICATION_LOCK log codes', () => {
    it.each([
      [
        'ACQUIRED',
        'debug',
        {
          sbi: TEST_SBI.DEFAULT,
          ownerId: TEST_USER_IDS.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          grantVersion: TEST_GRANT_VERSION.DEFAULT
        },
        `Acquired application lock | sbi=${TEST_SBI.DEFAULT} | ownerId=${TEST_USER_IDS.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | grantVersion=${TEST_GRANT_VERSION.DEFAULT}`
      ],
      [
        'RELEASED',
        'info',
        {
          sbi: TEST_SBI.DEFAULT,
          ownerId: TEST_USER_IDS.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          grantVersion: TEST_GRANT_VERSION.DEFAULT
        },
        `Released application lock | sbi=${TEST_SBI.DEFAULT} | ownerId=${TEST_USER_IDS.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | grantVersion=${TEST_GRANT_VERSION.DEFAULT}`
      ],
      [
        'ACQUISITION_FAILED',
        'error',
        {
          sbi: TEST_SBI.DEFAULT,
          ownerId: TEST_USER_IDS.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          grantVersion: TEST_GRANT_VERSION.DEFAULT,
          stack: 'some stack trace'
        },
        `Failed to acquire application lock | sbi=${TEST_SBI.DEFAULT} | ownerId=${TEST_USER_IDS.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | grantVersion=${TEST_GRANT_VERSION.DEFAULT} | stack=some stack trace`
      ],
      [
        'RELEASE_FAILED',
        'error',
        {
          errorName: TEST_ERRORS.PROCESSING_FAILED,
          errorMessage: TEST_ERRORS.PROCESSING_FAILED,
          errorReason: TEST_ERRORS.PROCESSING_FAILED,
          errorCode: TEST_ERRORS.PROCESSING_FAILED,
          isMongoError: false,
          stack: 'some stack trace'
        },
        `Failed to release application lock | errorName=${TEST_ERRORS.PROCESSING_FAILED} | errorMessage=${TEST_ERRORS.PROCESSING_FAILED} | errorReason=${TEST_ERRORS.PROCESSING_FAILED} | errorCode=${TEST_ERRORS.PROCESSING_FAILED} | isMongoError=false | stack=some stack trace`
      ],
      [
        'LOCK_TOKEN_MISSING',
        'warn',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          method: TEST_METHODS.GET
        },
        `Missing application lock token | path=${TEST_PATHS.EXAMPLE_GRANT} | method=${TEST_METHODS.GET}`
      ],
      [
        'LOCK_TOKEN_INVALID',
        'warn',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          method: TEST_METHODS.GET,
          errorName: TEST_ERRORS.PROCESSING_FAILED,
          errorMessage: TEST_ERRORS.PROCESSING_FAILED
        },
        `Invalid application lock token | path=${TEST_PATHS.EXAMPLE_GRANT} | method=${TEST_METHODS.GET} | errorName=${TEST_ERRORS.PROCESSING_FAILED} | errorMessage=${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      [
        'LOCK_TOKEN_WRONG_TYPE',
        'warn',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          method: TEST_METHODS.GET,
          typ: 'invalid-type'
        },
        `Invalid application lock token type | path=${TEST_PATHS.EXAMPLE_GRANT} | method=${TEST_METHODS.GET} | typ=invalid-type`
      ],
      [
        'LOCK_TOKEN_MISSING_USER_IDENTITY',
        'warn',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          method: TEST_METHODS.GET,
          userId: TEST_USER_IDS.DEFAULT
        },
        `Missing required lock token user identity claim | path=${TEST_PATHS.EXAMPLE_GRANT} | method=${TEST_METHODS.GET} | userId=${TEST_USER_IDS.DEFAULT}`
      ],
      [
        'LOCK_TOKEN_MISSING_SBI',
        'warn',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          method: TEST_METHODS.GET,
          sbi: TEST_SBI.DEFAULT
        },
        `Missing required lock token SBI claim | path=${TEST_PATHS.EXAMPLE_GRANT} | method=${TEST_METHODS.GET} | sbi=${TEST_SBI.DEFAULT}`
      ],
      [
        'LOCK_TOKEN_MISSING_GRANT_CODE',
        'warn',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          method: TEST_METHODS.GET,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH
        },
        `Missing required lock token grant code claim | path=${TEST_PATHS.EXAMPLE_GRANT} | method=${TEST_METHODS.GET} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}`
      ],
      [
        'LOCK_TOKEN_INVALID_VERSION',
        'warn',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          method: TEST_METHODS.GET,
          grantVersion: TEST_GRANT_VERSION.DEFAULT
        },
        `Invalid grantVersion in lock token | path=${TEST_PATHS.EXAMPLE_GRANT} | method=${TEST_METHODS.GET} | grantVersion=${TEST_GRANT_VERSION.DEFAULT}`
      ],
      [
        'LOCK_CONFLICT',
        'info',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          method: TEST_METHODS.GET,
          sbi: TEST_SBI.DEFAULT,
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          ownerId: TEST_USER_IDS.DEFAULT
        },
        `Application lock conflict | path=${TEST_PATHS.EXAMPLE_GRANT} | method=${TEST_METHODS.GET} | sbi=${TEST_SBI.DEFAULT} | grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH} | ownerId=${TEST_USER_IDS.DEFAULT}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      assertLogCode('APPLICATION_LOCK', logCodeName, expectedLevel, testParams, expectedMessage)
    })
  })

  describe('APPLICATION_LOCKS log codes', () => {
    it.each([
      [
        'RELEASED',
        'info',
        { releasedCount: 2, ownerId: TEST_USER_IDS.DEFAULT },
        `Released 2 application locks for owner ${TEST_USER_IDS.DEFAULT}`
      ],
      [
        'RELEASE_FAILED',
        'error',
        {
          ownerId: TEST_USER_IDS.DEFAULT,
          errorName: TEST_ERRORS.PROCESSING_FAILED,
          errorMessage: TEST_ERRORS.PROCESSING_FAILED,
          errorReason: TEST_ERRORS.PROCESSING_FAILED,
          errorCode: TEST_ERRORS.PROCESSING_FAILED,
          isMongoError: false,
          stack: 'some stack trace'
        },
        `Failed to release application locks | ownerId=${TEST_USER_IDS.DEFAULT} | errorName=${TEST_ERRORS.PROCESSING_FAILED} | errorMessage=${TEST_ERRORS.PROCESSING_FAILED} | errorReason=${TEST_ERRORS.PROCESSING_FAILED} | errorCode=${TEST_ERRORS.PROCESSING_FAILED} | isMongoError=false | stack=some stack trace`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      assertLogCode('APPLICATION_LOCKS', logCodeName, expectedLevel, testParams, expectedMessage)
    })
  })

  describe('SYSTEM log codes', () => {
    it.each([
      [
        'SERVER_ERROR',
        'error',
        { error: TEST_ERRORS.DATABASE_ERROR },
        `Server error occurred: ${TEST_ERRORS.DATABASE_ERROR}`
      ],
      [
        'SYSTEM_STARTUP',
        'info',
        { port: TEST_PORTS.DEFAULT },
        `System startup completed on port=${TEST_PORTS.DEFAULT}`
      ],
      ['SYSTEM_SHUTDOWN', 'info', {}, 'System shutdown initiated'],
      [
        'ENV_CONFIG_DEBUG',
        'debug',
        { configType: 'database', configValues: { host: 'localhost', port: 5432 } },
        'Environment configuration: database - {"host":"localhost","port":5432}'
      ],
      ['STARTUP_PHASE', 'info', { phase: 'plugins', status: 'completed' }, 'Startup phase: plugins - completed'],
      [
        'PLUGIN_REGISTRATION',
        'debug',
        { pluginName: 'auth-plugin', status: 'registered' },
        'Plugin registration: auth-plugin - registered'
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      assertLogCode('SYSTEM', logCodeName, expectedLevel, testParams, expectedMessage)
    })
  })

  describe('validateLogCodes', () => {
    it('should validate all log codes without throwing', () => {
      expect(() => validateLogCodes(LogCodes)).not.toThrow()
    })

    it.each([
      [
        'invalid log code structure',
        {
          TEST: {
            INVALID: {
              level: 'invalid',
              messageFunc: () => 'test'
            }
          }
        }
      ],
      [
        'missing messageFunc',
        {
          TEST: {
            INVALID: {
              level: 'info'
            }
          }
        }
      ],
      [
        'missing level',
        {
          TEST: {
            INVALID: {
              messageFunc: () => 'test'
            }
          }
        }
      ],
      [
        'null values',
        {
          TEST: {
            INVALID: null
          }
        }
      ],
      [
        'invalid nested structure',
        {
          TEST: {
            NESTED: {
              INVALID: 'not an object'
            }
          }
        }
      ],
      [
        'array values',
        {
          TEST: {
            INVALID: ['not', 'an', 'object']
          }
        }
      ],
      [
        'function values',
        {
          TEST: {
            INVALID: () => {
              return 'test'
            }
          }
        }
      ]
    ])('should throw error for %s', (_description, invalidLogCodes) => {
      expect(() => validateLogCodes(invalidLogCodes)).toThrow()
    })

    it('should throw error for nested validation failure', () => {
      const invalidLogCodes = {
        TEST: {
          CATEGORY: {
            INVALID: {
              level: 'info'
            }
          }
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow('Invalid log code definition for "INVALID"')
    })
  })
})
