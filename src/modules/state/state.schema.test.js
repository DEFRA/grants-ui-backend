import { stateSaveSchema, stateRetrieveSchema, addSubmissionSchema } from './state.schema.js'

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
