import {
  formDefinitionSchema,
  resolveLatestVersionSchema,
  resolveLatestVersionWithinMajorSchema,
  getDefinitionSchema
} from './config.schema.js'
import { FORM_DEFINITION_STATUS } from './config.constants.js'

const validFormDefinition = {
  grantCode: 'farm-payments',
  id: 'fd-001',
  title: 'Farm Payments Application',
  major: 1,
  minor: 2,
  patch: 3,
  definition: { pages: [] },
  status: FORM_DEFINITION_STATUS.ACTIVE,
  updatedAt: new Date('2024-01-01T00:00:00.000Z')
}

describe('formDefinitionSchema', () => {
  test('accepts a valid form definition', () => {
    const { error } = formDefinitionSchema.validate(validFormDefinition)
    expect(error).toBeUndefined()
  })

  test('accepts status "draft"', () => {
    const { error } = formDefinitionSchema.validate({ ...validFormDefinition, status: FORM_DEFINITION_STATUS.DRAFT })
    expect(error).toBeUndefined()
  })

  test('rejects unknown fields', () => {
    const { error } = formDefinitionSchema.validate({ ...validFormDefinition, extra: 'field' })
    expect(error).toBeDefined()
  })

  test.each(['grantCode', 'id', 'title', 'major', 'minor', 'patch', 'definition', 'status', 'updatedAt'])(
    'rejects when required field "%s" is missing',
    (field) => {
      const input = { ...validFormDefinition }
      delete input[field]
      const { error } = formDefinitionSchema.validate(input)
      expect(error).toBeDefined()
    }
  )

  test('rejects invalid status value', () => {
    const { error } = formDefinitionSchema.validate({ ...validFormDefinition, status: 'archived' })
    expect(error).toBeDefined()
  })

  test('rejects negative semver parts', () => {
    const { error } = formDefinitionSchema.validate({ ...validFormDefinition, major: -1 })
    expect(error).toBeDefined()
  })

  test('rejects non-integer semver parts', () => {
    const { error } = formDefinitionSchema.validate({ ...validFormDefinition, minor: 1.5 })
    expect(error).toBeDefined()
  })
})

describe('resolveLatestVersionSchema', () => {
  test('accepts a valid grantCode', () => {
    const { error } = resolveLatestVersionSchema.validate({ grantCode: 'farm-payments' })
    expect(error).toBeUndefined()
  })

  test('rejects missing grantCode', () => {
    const { error } = resolveLatestVersionSchema.validate({})
    expect(error).toBeDefined()
  })
})

describe('resolveLatestVersionWithinMajorSchema', () => {
  test('accepts valid grantCode and major', () => {
    const { error } = resolveLatestVersionWithinMajorSchema.validate({ grantCode: 'farm-payments', major: 2 })
    expect(error).toBeUndefined()
  })

  test('rejects missing major', () => {
    const { error } = resolveLatestVersionWithinMajorSchema.validate({ grantCode: 'farm-payments' })
    expect(error).toBeDefined()
  })

  test('rejects negative major', () => {
    const { error } = resolveLatestVersionWithinMajorSchema.validate({ grantCode: 'farm-payments', major: -1 })
    expect(error).toBeDefined()
  })
})

describe('getDefinitionSchema', () => {
  test('accepts valid grantCode and semver parts', () => {
    const { error } = getDefinitionSchema.validate({ grantCode: 'farm-payments', major: 1, minor: 2, patch: 3 })
    expect(error).toBeUndefined()
  })

  test('rejects missing patch', () => {
    const { error } = getDefinitionSchema.validate({ grantCode: 'farm-payments', major: 1, minor: 2 })
    expect(error).toBeDefined()
  })

  test('rejects missing grantCode', () => {
    const { error } = getDefinitionSchema.validate({ major: 1, minor: 2, patch: 3 })
    expect(error).toBeDefined()
  })
})
