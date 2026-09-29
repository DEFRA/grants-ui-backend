import { ingestFeatureControlMessage } from './ingest-feature-control.js'
import { upsertFeatureControl } from './feature-control.repository.js'

jest.mock('./feature-control.repository.js', () => ({
  upsertFeatureControl: jest.fn()
}))

jest.mock('../../common/helpers/logging/log.js', () => {
  const { LogCodes } = jest.requireActual('../../common/helpers/logging/log-codes.js')
  return { log: jest.fn(), LogCodes }
})

const snsBody = ({ name = 'EXAMPLE_FEATURE_WOODLAND', valueType = 'boolean', scopes = ['grant.woodland'], value }) =>
  JSON.stringify({
    Type: 'Notification',
    Message: JSON.stringify(value),
    MessageAttributes: {
      name: { Type: 'String', Value: name },
      valueType: { Type: 'String', Value: valueType },
      scopes: { Type: 'String.Array', Value: JSON.stringify(scopes) },
      updatedBy: { Type: 'String', Value: 'someone' }
    }
  })

describe('ingestFeatureControlMessage', () => {
  beforeEach(() => jest.clearAllMocks())

  test.each([true, false])('stores a boolean grant-scoped control from an SNS envelope (%s)', async (value) => {
    const stored = await ingestFeatureControlMessage({ Body: snsBody({ value }) })

    expect(stored).toBe(true)
    expect(upsertFeatureControl).toHaveBeenCalledWith({
      name: 'EXAMPLE_FEATURE_WOODLAND',
      value,
      valueType: 'boolean',
      scopes: ['grant.woodland']
    })
  })

  test('stores from raw delivery, reading attributes from the SQS message', async () => {
    const stored = await ingestFeatureControlMessage({
      Body: 'false',
      MessageAttributes: {
        name: { StringValue: 'EXAMPLE_FEATURE_WOODLAND' },
        valueType: { StringValue: 'boolean' },
        scopes: { StringValue: '["grant.woodland"]' }
      }
    })

    expect(stored).toBe(true)
    expect(upsertFeatureControl).toHaveBeenCalledWith(expect.objectContaining({ value: false }))
  })

  test('upper-cases the name before storing', async () => {
    await ingestFeatureControlMessage({ Body: snsBody({ name: 'example_feature_woodland', value: true }) })

    expect(upsertFeatureControl).toHaveBeenCalledWith(expect.objectContaining({ name: 'EXAMPLE_FEATURE_WOODLAND' }))
  })

  test('ignores non-boolean controls', async () => {
    const stored = await ingestFeatureControlMessage({ Body: snsBody({ valueType: 'string', value: 'x' }) })

    expect(stored).toBe(false)
    expect(upsertFeatureControl).not.toHaveBeenCalled()
  })

  it.each([
    ['only non-grant scopes', ['service.other']],
    ['no scopes at all', []]
  ])('ignores a control with %s', async (_label, scopes) => {
    const stored = await ingestFeatureControlMessage({ Body: snsBody({ scopes, value: true }) })

    expect(stored).toBe(false)
    expect(upsertFeatureControl).not.toHaveBeenCalled()
  })

  test('throws when name or valueType are missing', async () => {
    const body = JSON.stringify({ Type: 'Notification', Message: 'true', MessageAttributes: {} })

    await expect(ingestFeatureControlMessage({ Body: body })).rejects.toThrow('missing required attributes')
  })

  test('throws when a boolean control carries a non-boolean value', async () => {
    await expect(ingestFeatureControlMessage({ Body: snsBody({ value: 'yes' }) })).rejects.toThrow('valueType boolean')
  })

  test('throws when scopes is not a JSON array', async () => {
    const body = JSON.stringify({
      Type: 'Notification',
      Message: 'true',
      MessageAttributes: {
        name: { Type: 'String', Value: 'X' },
        valueType: { Type: 'String', Value: 'boolean' },
        scopes: { Type: 'String', Value: '"grant.woodland"' }
      }
    })

    await expect(ingestFeatureControlMessage({ Body: body })).rejects.toThrow('not an array')
  })

  test('propagates repository errors so the message is redelivered', async () => {
    upsertFeatureControl.mockRejectedValueOnce(new Error('mongo down'))

    await expect(ingestFeatureControlMessage({ Body: snsBody({ value: true }) })).rejects.toThrow('mongo down')
  })
})
