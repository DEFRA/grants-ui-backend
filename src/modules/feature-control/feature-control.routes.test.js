import { featureControlValue } from './feature-control.routes.js'
import { findFeatureControl } from './feature-control.repository.js'

jest.mock('./feature-control.repository.js', () => ({
  findFeatureControl: jest.fn()
}))

describe('featureControlValue route', () => {
  let mockH

  beforeEach(() => {
    jest.clearAllMocks()
    mockH = {
      response: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis()
    }
  })

  test('is a bearer-authenticated GET route', () => {
    expect(featureControlValue.method).toBe('GET')
    expect(featureControlValue.path).toBe('/feature-controls/{name}')
    expect(featureControlValue.options.auth).toBe('bearer')
  })

  test.each([true, false])('returns 200 with the bare boolean %s', async (value) => {
    findFeatureControl.mockResolvedValue({ value, valueType: 'boolean' })

    await featureControlValue.handler({ params: { name: 'EXAMPLE_FEATURE_WOODLAND' } }, mockH)

    expect(mockH.response).toHaveBeenCalledWith(value)
    expect(mockH.code).toHaveBeenCalledWith(200)
  })

  test('looks the name up in upper case', async () => {
    findFeatureControl.mockResolvedValue({ value: true, valueType: 'boolean' })

    await featureControlValue.handler({ params: { name: 'example_feature_woodland' } }, mockH)

    expect(findFeatureControl).toHaveBeenCalledWith('EXAMPLE_FEATURE_WOODLAND')
  })

  test('throws 404 when no value has been stored', async () => {
    findFeatureControl.mockResolvedValue(null)

    await expect(featureControlValue.handler({ params: { name: 'UNKNOWN' } }, mockH)).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 404 }
    })
  })
})
