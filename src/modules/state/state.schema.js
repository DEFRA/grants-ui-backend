import Joi from 'joi'

/**
 * Joi validation schemas for the state module's routes.
 *
 * `grantVersion` is accepted as either an integer or a string. The state
 * routes default a missing value to `1`; the submissions and lock routes
 * require it explicitly — these variants are intentionally kept distinct.
 */
const grantVersion = () => Joi.alternatives().try(Joi.number().integer(), Joi.string())

// --- /state routes ---

export const stateSaveSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: grantVersion().default(1),
  state: Joi.object().unknown(true).required().messages({
    'object.base': '"state" must be an object'
  })
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

export const stateRetrieveSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: grantVersion().default(1)
})

export const patchParamsSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: grantVersion().default(1)
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
