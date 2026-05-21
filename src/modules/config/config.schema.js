import Joi from 'joi'

/**
 * Joi validation schemas for the config module's routes.
 */

const semverPart = () => Joi.number().integer().min(0)

// --- /config routes ---

export const formDefinitionSchema = Joi.object({
  grantCode: Joi.string().required(),
  id: Joi.string().required(),
  title: Joi.string().required(),
  major: semverPart().required(),
  minor: semverPart().required(),
  patch: semverPart().required(),
  definition: Joi.object().unknown(true).required(),
  status: Joi.string().valid('draft', 'live').required(),
  updatedAt: Joi.date().required()
})
  .required()
  .unknown(false)

export const resolveLatestVersionSchema = Joi.object({
  grantCode: Joi.string().required()
})

export const resolveLatestVersionWithinMajorSchema = Joi.object({
  grantCode: Joi.string().required(),
  major: semverPart().required()
})

export const getDefinitionSchema = Joi.object({
  grantCode: Joi.string().required(),
  major: semverPart().required(),
  minor: semverPart().required(),
  patch: semverPart().required()
})
