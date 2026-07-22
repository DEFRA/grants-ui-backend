import { clearTestDataRoute } from './test-data.routes.js'
import { log, LogCodes } from '~/src/common/helpers/logging/log.js'
import { clearTestData } from './state.service.js'
import { config } from '~/src/config.js'

jest.mock('~/src/common/helpers/logging/log.js', () => {
  const { LogCodes } = jest.requireActual('~/src/common/helpers/logging/log-codes.js')
  return { log: jest.fn(), LogCodes }
})
jest.mock('./state.service.js', () => ({
  clearTestData: jest.fn()
}))
jest.mock('~/src/config.js', () => ({
  config: { get: jest.fn() }
}))

const createMockH = () => {
  const response = {
    code: jest.fn().mockReturnThis()
  }
  return {
    response: jest.fn(() => response)
  }
}

const createMockRequest = (overrides = {}) => ({
  query: {
    sbi: '123456789',
    grantCode: 'GRANT1'
  },
  ...overrides
})

describe('clearTestDataRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    config.get.mockReturnValue('test')
  })

  it('clears test data and returns deleted counts when environment is permitted', async () => {
    clearTestData.mockResolvedValue({
      stateDeletedCount: 2,
      submissionsDeletedCount: 1,
      locksDeletedCount: 1
    })

    const request = createMockRequest()
    const h = createMockH()

    const result = await clearTestDataRoute.handler(request, h)

    expect(clearTestData).toHaveBeenCalledWith({ sbi: '123456789', grantCode: 'GRANT1' })
    expect(h.response).toHaveBeenCalledWith({
      success: true,
      stateDeletedCount: 2,
      submissionsDeletedCount: 1,
      locksDeletedCount: 1
    })
    expect(result.code).toHaveBeenCalledWith(200)
  })

  it('throws Boom 403 when cdpEnvironment is prod', async () => {
    config.get.mockReturnValue('prod')

    const request = createMockRequest()
    const h = createMockH()

    await expect(clearTestDataRoute.handler(request, h)).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 403 }
    })
    expect(clearTestData).not.toHaveBeenCalled()
  })

  it.each(['local', 'dev', 'test', 'perf-test', 'ext-test'])('permits clearing in %s environment', async (env) => {
    config.get.mockReturnValue(env)
    clearTestData.mockResolvedValue({
      stateDeletedCount: 0,
      submissionsDeletedCount: 0,
      locksDeletedCount: 0
    })

    const request = createMockRequest()
    const h = createMockH()

    await clearTestDataRoute.handler(request, h)

    expect(clearTestData).toHaveBeenCalledWith({ sbi: '123456789', grantCode: 'GRANT1' })
  })

  it('returns 500 when clearTestData throws', async () => {
    const err = new Error('Mongo exploded')
    err.code = 123
    err.reason = 'boom'

    clearTestData.mockRejectedValue(err)

    const request = createMockRequest()
    const h = createMockH()

    const result = await clearTestDataRoute.handler(request, h)

    expect(h.response).toHaveBeenCalledWith({
      error: 'Failed to clear test data'
    })
    expect(result.code).toHaveBeenCalledWith(500)
  })

  it('logs and throws on validation failure (failAction)', async () => {
    const badRequest = {
      query: {
        // missing sbi
        grantCode: 'GRANT1'
      }
    }

    const schema = clearTestDataRoute.options.validate.query
    const { error } = schema.validate(badRequest.query)

    expect(error).toBeInstanceOf(Error)

    expect(() => clearTestDataRoute.options.validate.failAction(badRequest, {}, error)).toThrow()

    expect(log).toHaveBeenCalledWith(
      LogCodes.TEST_DATA.CLEAR_FAILED,
      expect.objectContaining({
        grantCode: 'GRANT1',
        errorName: error.name,
        errorMessage: expect.stringContaining('validation failed')
      })
    )
  })
})
