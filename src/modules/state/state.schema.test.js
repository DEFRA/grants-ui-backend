import { stateSaveSchema, stateRetrieveSchema, stateWithDefinitionSchema, addSubmissionSchema } from './state.schema.js'

const validSave = {
  sbi: '123456789',
  grantCode: 'farm-payments',
  grantVersion: '1.0.0',
  state: { applicationStatus: 'IN_PROGRESS' }
}

describe('grantVersion validation', () => {
  test('accepts a valid semver string', () => {
    const { error, value } = stateSaveSchema.validate(validSave)
    expect(error).toBeUndefined()
    expect(value.grantVersion).toBe('1.0.0')
  })

  test('defaults to "1.0.0" when omitted', () => {
    const { grantVersion, ...withoutVersion } = validSave
    const { error, value } = stateSaveSchema.validate(withoutVersion)
    expect(error).toBeUndefined()
    expect(value.grantVersion).toBe('1.0.0')
  })

  // TEMPORARY: grants-ui still sends the legacy integer 1 until it adopts semver.
  test('coerces the legacy integer 1 to "1.0.0"', () => {
    const { error, value } = stateSaveSchema.validate({ ...validSave, grantVersion: 1 })
    expect(error).toBeUndefined()
    expect(value.grantVersion).toBe('1.0.0')
  })

  test('coerces the legacy string "1" to "1.0.0"', () => {
    const { error, value } = stateRetrieveSchema.validate({
      sbi: '123456789',
      grantCode: 'farm-payments',
      grantVersion: '1'
    })
    expect(error).toBeUndefined()
    expect(value.grantVersion).toBe('1.0.0')
  })

  test('rejects other non-semver integers', () => {
    const { error } = stateSaveSchema.validate({ ...validSave, grantVersion: 2 })
    expect(error).toBeDefined()
    expect(error.message).toContain('must be a semver string')
  })

  test('rejects a malformed version string', () => {
    const { error } = stateSaveSchema.validate({ ...validSave, grantVersion: 'v1.2' })
    expect(error).toBeDefined()
    expect(error.message).toContain('must be a semver string')
  })

  test('coerces the legacy integer 1 for required submission grantVersion', () => {
    const { error, value } = addSubmissionSchema.validate({
      crn: 'CRN123',
      sbi: '123456789',
      grantCode: 'farm-payments',
      grantVersion: 1,
      referenceNumber: 'REF-1',
      submittedAt: new Date('2024-01-01T00:00:00.000Z')
    })
    expect(error).toBeUndefined()
    expect(value.grantVersion).toBe('1.0.0')
  })
})

describe('stateWithDefinitionSchema', () => {
  test('accepts sbi + grantCode and defaults includeDefinition to true', () => {
    const { error, value } = stateWithDefinitionSchema.validate({ sbi: '123456789', grantCode: 'farm-payments' })
    expect(error).toBeUndefined()
    expect(value).toEqual({ sbi: '123456789', grantCode: 'farm-payments', includeDefinition: true })
  })

  test('accepts an explicit includeDefinition: false', () => {
    const { error, value } = stateWithDefinitionSchema.validate({
      sbi: '123456789',
      grantCode: 'farm-payments',
      includeDefinition: false
    })
    expect(error).toBeUndefined()
    expect(value.includeDefinition).toBe(false)
  })

  test('rejects a non-boolean includeDefinition', () => {
    const { error } = stateWithDefinitionSchema.validate({
      sbi: '123456789',
      grantCode: 'farm-payments',
      includeDefinition: 'nope'
    })
    expect(error).toBeDefined()
  })

  test('rejects a missing sbi', () => {
    const { error } = stateWithDefinitionSchema.validate({ grantCode: 'farm-payments' })
    expect(error).toBeDefined()
  })

  test('rejects a missing grantCode', () => {
    const { error } = stateWithDefinitionSchema.validate({ sbi: '123456789' })
    expect(error).toBeDefined()
  })

  test('rejects unknown fields (e.g. a stray referenceNumber)', () => {
    const { error } = stateWithDefinitionSchema.validate({
      sbi: '123456789',
      grantCode: 'farm-payments',
      referenceNumber: 'REF-1'
    })
    expect(error).toBeDefined()
  })
})
