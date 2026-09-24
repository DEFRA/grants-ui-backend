import { runFeatureControlStartupPull } from './feature-control-startup-pull.js'
import { fetchFeatureControls } from '../config/ingest/broker-client.js'
import { storeFeatureControl } from './ingest-feature-control.js'

jest.mock('../config/ingest/broker-client.js', () => ({
  fetchFeatureControls: jest.fn()
}))

jest.mock('./ingest-feature-control.js', () => ({
  storeFeatureControl: jest.fn()
}))

jest.mock('../../common/helpers/logging/log.js', () => {
  const { LogCodes } = jest.requireActual('../../common/helpers/logging/log-codes.js')
  return { log: jest.fn(), LogCodes }
})

const item = (name, value = true) => ({ name, type: 'boolean', value, scopes: ['grant.woodland'] })

describe('runFeatureControlStartupPull', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    storeFeatureControl.mockResolvedValue(true)
  })

  test('stores every item across all pages', async () => {
    fetchFeatureControls
      .mockResolvedValueOnce({ items: [item('A'), item('B')], totalPages: 2 })
      .mockResolvedValueOnce({ items: [item('C', false)], totalPages: 2 })

    const result = await runFeatureControlStartupPull()

    expect(fetchFeatureControls).toHaveBeenNthCalledWith(1, 1, 100)
    expect(fetchFeatureControls).toHaveBeenNthCalledWith(2, 2, 100)
    expect(storeFeatureControl).toHaveBeenCalledWith({
      name: 'C',
      valueType: 'boolean',
      scopes: ['grant.woodland'],
      value: false
    })
    expect(result).toEqual({ total: 3, stored: 3, failed: 0 })
  })

  test('does not count items the ingest skips as stored', async () => {
    fetchFeatureControls.mockResolvedValue({ items: [item('A'), item('B')], totalPages: 1 })
    storeFeatureControl.mockResolvedValueOnce(false)

    await expect(runFeatureControlStartupPull()).resolves.toEqual({ total: 2, stored: 1, failed: 0 })
  })

  test('counts and swallows a failing item, continuing with the rest', async () => {
    fetchFeatureControls.mockResolvedValue({ items: [item('A'), item('B')], totalPages: 1 })
    storeFeatureControl.mockRejectedValueOnce(new Error('bad value'))

    await expect(runFeatureControlStartupPull()).resolves.toEqual({ total: 2, stored: 1, failed: 1 })
  })

  test('throws when the broker response has no items array', async () => {
    fetchFeatureControls.mockResolvedValue({})

    await expect(runFeatureControlStartupPull()).rejects.toThrow('items array')
  })

  test('propagates broker errors to the caller', async () => {
    fetchFeatureControls.mockRejectedValue(new Error('broker down'))

    await expect(runFeatureControlStartupPull()).rejects.toThrow('broker down')
  })
})
