import { runStartupPurge } from './purge-unsubmitted-applications.js'
import { config } from '../../config.js'
import { purgeApplications } from './state.service.js'
import { parsePurgeConfig } from '~/src/common/helpers/version/version.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

jest.mock('../../config.js', () => ({
  config: {
    get: jest.fn()
  }
}))

jest.mock('./state.service.js', () => ({
  purgeApplications: jest.fn()
}))

jest.mock('~/src/common/helpers/version/version.js', () => ({
  parsePurgeConfig: jest.fn()
}))

jest.mock('../../common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    PURGE: {
      SKIPPED: 'PURGE_SKIPPED',
      STARTED: 'PURGE_STARTED',
      COMPLETED: 'PURGE_COMPLETED',
      FAILED: 'PURGE_FAILED'
    }
  }
}))

describe('runStartupPurge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('logs SKIPPED when no rules are configured', async () => {
    config.get.mockReturnValue('')
    parsePurgeConfig.mockReturnValue([])

    await runStartupPurge()

    expect(log).toHaveBeenCalledWith(LogCodes.PURGE.SKIPPED, {
      reason: 'no-rules-configured'
    })

    expect(purgeApplications).not.toHaveBeenCalled()
  })

  test('processes a single purge rule successfully', async () => {
    config.get.mockReturnValue('ffc:<2.0.0')

    parsePurgeConfig.mockReturnValue([
      {
        grantCode: 'ffc',
        rule: '<2.0.0'
      }
    ])

    purgeApplications.mockResolvedValue(7)

    await runStartupPurge()

    expect(purgeApplications).toHaveBeenCalledWith({
      grantCode: 'ffc',
      versionRule: '<2.0.0'
    })

    expect(log).toHaveBeenCalledWith(LogCodes.PURGE.STARTED, {
      grantCode: 'ffc',
      rule: '<2.0.0'
    })

    expect(log).toHaveBeenCalledWith(LogCodes.PURGE.COMPLETED, {
      grantCode: 'ffc',
      rule: '<2.0.0',
      purgedCount: 7
    })
  })

  test('processes multiple purge rules', async () => {
    parsePurgeConfig.mockReturnValue([
      { grantCode: 'ffc', rule: '<2.0.0' },
      { grantCode: 'sfi', rule: '1.0.0' }
    ])

    purgeApplications.mockResolvedValueOnce(3).mockResolvedValueOnce(5)

    await runStartupPurge()

    expect(purgeApplications).toHaveBeenCalledTimes(2)

    expect(purgeApplications).toHaveBeenNthCalledWith(1, {
      grantCode: 'ffc',
      versionRule: '<2.0.0'
    })

    expect(purgeApplications).toHaveBeenNthCalledWith(2, {
      grantCode: 'sfi',
      versionRule: '1.0.0'
    })
  })

  test('logs FAILED when purge throws', async () => {
    const error = new Error('Boom')

    parsePurgeConfig.mockReturnValue([{ grantCode: 'ffc', rule: '<2.0.0' }])

    purgeApplications.mockRejectedValue(error)

    await runStartupPurge()

    expect(log).toHaveBeenCalledWith(LogCodes.PURGE.FAILED, {
      grantCode: 'ffc',
      rule: '<2.0.0',
      errorName: 'Error',
      errorMessage: 'Boom',
      errorReason: undefined,
      errorCode: undefined,
      isMongoError: false,
      stack: expect.stringContaining('Error: Boom')
    })
  })

  test('continues processing after a failed rule', async () => {
    parsePurgeConfig.mockReturnValue([
      { grantCode: 'ffc', rule: '<2.0.0' },
      { grantCode: 'sfi', rule: '1.0.0' }
    ])

    purgeApplications.mockRejectedValueOnce(new Error('Failed')).mockResolvedValueOnce(4)

    await runStartupPurge()

    expect(purgeApplications).toHaveBeenCalledTimes(2)

    expect(log).toHaveBeenCalledWith(LogCodes.PURGE.COMPLETED, {
      grantCode: 'sfi',
      rule: '1.0.0',
      purgedCount: 4
    })
  })

  test('sets isMongoError=true for Mongo errors', async () => {
    const error = Object.assign(new Error('Mongo failed'), {
      name: 'MongoServerError',
      code: 11000
    })

    parsePurgeConfig.mockReturnValue([{ grantCode: 'ffc', rule: '<2.0.0' }])

    purgeApplications.mockRejectedValue(error)

    await runStartupPurge()

    expect(log).toHaveBeenCalledWith(
      LogCodes.PURGE.FAILED,
      expect.objectContaining({
        isMongoError: true,
        errorName: 'MongoServerError',
        errorCode: 11000
      })
    )
  })
})
