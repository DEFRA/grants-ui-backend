import Joi from 'joi'

/**
 * Joi validation schemas for the state module's routes.
 */
const SEMVER_RE = /^\d+\.\d+\.\d+$/

/**
 * TEMPORARY: grants-ui may still send `grantVersion` as the integer `1`
 * until it is updated to use semver as well. Coerce that single legacy value
 * to the `'1.0.0'` semver string so those requests keep working. Remove this
 * tolerance once grants-ui sends semver strings.
 *
 * @param {*} value - The raw grantVersion value (integer `1`, `'1'`, or a semver string)
 * @returns {string|null} The normalised semver string, or `null` if not coercible
 */
export const normalizeGrantVersion = (value) => {
  if (value === 1 || value === '1') {
    return '1.0.0'
  }
  if (typeof value === 'string' && SEMVER_RE.test(value)) {
    return value
  }
  return null
}

const coerceLegacyGrantVersion = (value, helpers) => {
  const normalized = normalizeGrantVersion(value)
  if (normalized === null) {
    return helpers.error('string.pattern.base')
  }
  return normalized
}

const grantVersion = () =>
  Joi.any().custom(coerceLegacyGrantVersion).messages({
    'string.pattern.base': '"grantVersion" must be a semver string (e.g. "1.0.0")'
  })

// --- /state routes ---

export const stateSaveSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: grantVersion().default('1.0.0'),
  state: Joi.object().unknown(true).required().messages({
    'object.base': '"state" must be an object'
  })
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

export const stateRetrieveSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: grantVersion().default('1.0.0'),
  document: Joi.boolean().optional() // TODO - remove when grants-ui changes for combined endpoint are merged
})

export const stateWithDefinitionSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  // When `false`, the caller already holds the form definition locally (e.g. a
  // legacy YAML-sourced form) and only needs the state, so the backend skips
  // resolving/serialising a definition and omits it from the response.
  includeDefinition: Joi.boolean().default(true)
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

export const patchParamsSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: grantVersion().default('1.0.0')
})

export const patchSchema = Joi.object({
  state: Joi.object({
    applicationStatus: Joi.string().required()
  })
    .required()
    .unknown(false) // Disallow any other state.* fields
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

// --- /submissions routes ---

export const addSubmissionSchema = Joi.object({
  crn: Joi.string().required(),
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: grantVersion().required(),
  referenceNumber: Joi.string().required(),
  previousReferenceNumber: Joi.string().allow(null),
  submittedAt: Joi.date().required()
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

export const retrieveSubmissionsSchema = Joi.object({
  crn: Joi.string(),
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: grantVersion(),
  referenceNumber: Joi.string()
})

// --- lock admin routes ---

export const applicationLockReleaseSchema = Joi.object({
  sbi: Joi.string().required(),
  ownerId: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: grantVersion().required()
})

// --- admin/test-data route ---

export const clearTestDataSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required()
})
