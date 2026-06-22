import { logIfApproachingPayloadLimit } from '../../common/helpers/logging/log-if-approaching-payload-limit.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { enforceApplicationLock, extractLockKeys } from './lock-enforcement.js'
import { StatusCodes } from 'http-status-codes'
import {
  stateSaveSchema,
  stateRetrieveSchema,
  stateWithDefinitionSchema,
  patchParamsSchema,
  patchSchema
} from './state.schema.js'
import {
  saveApplicationState,
  getApplicationState,
  deleteApplicationState,
  patchApplicationState,
  getStateWithFormDefinition
} from './state.service.js'

const PAYLOAD_SIZE_WARNING_THRESHOLD = 500_000 // 500 KB
const PAYLOAD_SIZE_MAX = 1_048_576 // 1 MB
const STATE_NOT_FOUND = 'State not found'
const FORM_DEFINITION_NOT_FOUND = 'Form definition not found'

export const stateSave = {
  method: 'POST',
  path: '/state',
  options: {
    auth: 'bearer',
    pre: [{ method: enforceApplicationLock }],
    payload: {
      maxBytes: PAYLOAD_SIZE_MAX, // 1MB
      output: 'data',
      parse: true,
      allow: 'application/json'
    },
    validate: {
      payload: stateSaveSchema,
      failAction: (request, _h, err) => {
        const { sbi, grantCode, grantVersion } = request.payload
        log(LogCodes.STATE.STATE_SAVE_FAILED, {
          sbi,
          grantCode,
          grantVersion,
          errorName: err.name,
          errorMessage: `POST /state, validation failed: ${err.message}`,
          errorReason: err.reason,
          errorCode: err.code,
          isMongoError: false,
          stack: err.stack?.split('\n')[0]
        })
        throw err
      }
    }
  },
  handler: async (request, h) => {
    logIfApproachingPayloadLimit(request, {
      threshold: PAYLOAD_SIZE_WARNING_THRESHOLD,
      max: PAYLOAD_SIZE_MAX
    })

    const { sbi, grantCode, grantVersion, state } = request.payload

    try {
      const result = await saveApplicationState({ sbi, grantCode, grantVersion, state })

      if (result.upsertedCount > 0) {
        return h.response({ success: true, created: true }).code(StatusCodes.CREATED)
      }

      return h.response({ success: true, updated: true }).code(StatusCodes.OK)
    } catch (_err) {
      return h.response({ error: 'Failed to save application state' }).code(StatusCodes.INTERNAL_SERVER_ERROR)
    }
  }
}

export const stateRetrieve = {
  method: 'GET',
  path: '/state',
  options: {
    auth: 'bearer',
    pre: [{ method: enforceApplicationLock }],
    validate: {
      query: stateRetrieveSchema,
      failAction: (request, _h, err) => {
        const { sbi, grantCode, grantVersion } = request.query
        log(LogCodes.STATE.STATE_RETRIEVE_FAILED, {
          sbi,
          grantCode,
          grantVersion,
          errorName: err.name,
          errorMessage: `GET /state, validation failed: ${err.message}`,
          errorReason: err.reason,
          errorCode: err.code,
          isMongoError: false,
          stack: err.stack?.split('\n')[0]
        })
        throw err
      }
    }
  },
  handler: async (request, h) => {
    const { sbi, grantCode, grantVersion } = request.query

    try {
      const document = await getApplicationState({ sbi, grantCode, grantVersion })

      if (!document) {
        return h.response({ error: STATE_NOT_FOUND }).code(StatusCodes.NOT_FOUND)
      }

      return h.response(document.state).code(StatusCodes.OK)
    } catch (_err) {
      return h.response({ error: 'Failed to retrieve application state' }).code(StatusCodes.INTERNAL_SERVER_ERROR)
    }
  }
}

export const stateDelete = {
  method: 'DELETE',
  path: '/state',
  options: {
    auth: 'bearer',
    pre: [{ method: enforceApplicationLock }],
    validate: {
      query: stateRetrieveSchema,
      failAction: (request, _h, err) => {
        const { sbi, grantCode, grantVersion } = request.query
        log(LogCodes.STATE.STATE_DELETE_FAILED, {
          sbi,
          grantCode,
          grantVersion,
          errorName: err.name,
          errorMessage: `DELETE /state, validation failed: ${err.message}`,
          errorReason: err.reason,
          errorCode: err.code,
          isMongoError: false,
          stack: err.stack?.split('\n')[0]
        })
        throw err
      }
    }
  },
  handler: async (request, h) => {
    const { sbi, grantCode, grantVersion } = request.query

    try {
      const doc = await deleteApplicationState({ sbi, grantCode, grantVersion })

      if (!doc) {
        return h.response({ error: STATE_NOT_FOUND }).code(StatusCodes.NOT_FOUND)
      }

      return h.response({ success: true, deleted: true }).code(StatusCodes.OK)
    } catch (_err) {
      return h.response({ error: 'Failed to delete application state' }).code(StatusCodes.INTERNAL_SERVER_ERROR)
    }
  }
}

export const statePatch = {
  method: 'PATCH',
  path: '/state/{sbi}/{grantCode}/{grantVersion}',
  options: {
    auth: 'bearer',
    pre: [{ method: enforceApplicationLock }],
    payload: {
      maxBytes: PAYLOAD_SIZE_MAX, // 1MB
      parse: true,
      output: 'data',
      allow: ['application/json']
    },
    validate: {
      params: patchParamsSchema,
      payload: patchSchema,
      failAction: (request, _h, err) => {
        const { sbi, grantCode, grantVersion } = request.params
        log(LogCodes.STATE.STATE_PATCH_FAILED, {
          sbi,
          grantCode,
          grantVersion,
          errorName: err.name,
          errorMessage: `PATCH /state, validation failed: ${err.message}`,
          errorReason: err.reason,
          errorCode: err.code,
          isMongoError: false,
          stack: err.stack?.split('\n')[0]
        })
        throw err
      }
    }
  },
  handler: async (request, h) => {
    const { sbi, grantCode, grantVersion } = request.params
    const { applicationStatus } = request.payload.state

    try {
      const document = await patchApplicationState({ sbi, grantCode, grantVersion, applicationStatus })

      if (!document) {
        return h.response({ error: STATE_NOT_FOUND }).code(StatusCodes.NOT_FOUND)
      }

      return h.response({ success: true, patched: true }).code(StatusCodes.OK)
    } catch (_err) {
      return h.response({ error: 'Failed to patch application state' }).code(StatusCodes.INTERNAL_SERVER_ERROR)
    }
  }
}

export const stateWithDefinition = {
  method: 'POST',
  path: '/state/with-definition',
  options: {
    auth: 'bearer',
    // No `enforceApplicationLock` pre-handler here: this endpoint is partly
    // responsible for resolving the grantVersion, so a cold first call cannot
    // yet carry a version-bearing lock token. Instead the lock is acquired
    // inside `getStateWithFormDefinition` once the version has been resolved.
    validate: {
      payload: stateWithDefinitionSchema,
      failAction: (request, _h, err) => {
        const { sbi, grantCode } = request.payload
        log(LogCodes.STATE.STATE_WITH_DEFINITION_FAILED, {
          sbi,
          grantCode,
          errorName: err.name,
          errorMessage: `POST /state/with-definition, validation failed: ${err.message}`,
          errorReason: err.reason,
          errorCode: err.code,
          isMongoError: false,
          stack: err.stack?.split('\n')[0]
        })
        throw err
      }
    }
  },
  handler: async (request, h) => {
    const { sbi, grantCode, includeDefinition } = request.payload

    // Identify the lock owner from the token, but tolerate a missing
    // grantVersion: the orchestrator resolves the authoritative version and
    // acquires the lock against it. A missing/invalid token still yields 401.
    const { ownerId } = extractLockKeys(request, { requireGrantVersion: false })

    try {
      const result = await getStateWithFormDefinition({ sbi, grantCode, ownerId, includeDefinition })

      if (!result) {
        return h.response({ error: FORM_DEFINITION_NOT_FOUND }).code(StatusCodes.NOT_FOUND)
      }

      return h.response(result).code(StatusCodes.OK)
    } catch (err) {
      // Lock conflicts (and other Boom errors) carry their own status code
      // (e.g. 423 Locked); let Hapi map them rather than masking as 500.
      if (err?.isBoom) {
        throw err
      }
      return h
        .response({ error: 'Failed to retrieve state with form definition' })
        .code(StatusCodes.INTERNAL_SERVER_ERROR)
    }
  }
}
