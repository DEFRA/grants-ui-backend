import { logIfApproachingPayloadLimit } from './log-if-approaching-payload-limit.js'
import { log, LogCodes } from '~/src/common/helpers/logging/log.js'

jest.mock('~/src/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    STATE: {
      STATE_PAYLOAD_SIZE: { level: 'info', messageFunc: jest.fn() },
      STATE_PAYLOAD_SIZE_WARNING: { level: 'warn', messageFunc: jest.fn() }
    }
  }
}))

describe('#logIfApproachingPayloadLimit', () => {
  let mockRequest

  beforeEach(() => {
    mockRequest = {
      payload: { userId: 'test-user', data: 'test-data' },
      path: '/test-path'
    }
  })

  test('should log payload size info', () => {
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(log).toHaveBeenCalledWith(
      LogCodes.STATE.STATE_PAYLOAD_SIZE,
      expect.objectContaining({
        payloadSize: 41
      })
    )
  })

  test('should log warning when payload exceeds threshold but within max', () => {
    const largePayload = 'x'.repeat(1500)
    mockRequest.payload = { userId: 'test-user', data: largePayload }
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(log).toHaveBeenCalledWith(
      LogCodes.STATE.STATE_PAYLOAD_SIZE_WARNING,
      expect.objectContaining({
        payloadSize: 1532,
        threshold: 1000,
        max: 2000,
        path: '/test-path',
        userId: 'test-user'
      })
    )
  })

  test('should not log warning when payload is below threshold', () => {
    const smallPayload = 'x'.repeat(100)
    mockRequest.payload = { userId: 'test-user', data: smallPayload }
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(log).not.toHaveBeenCalledWith(LogCodes.STATE.STATE_PAYLOAD_SIZE_WARNING, expect.any(Object))
  })

  test('should handle empty payload', () => {
    mockRequest.payload = null
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      LogCodes.STATE.STATE_PAYLOAD_SIZE,
      expect.objectContaining({
        payloadSize: 2
      })
    )
  })

  test('should handle undefined payload', () => {
    delete mockRequest.payload
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      LogCodes.STATE.STATE_PAYLOAD_SIZE,
      expect.objectContaining({
        payloadSize: 2
      })
    )
  })
})
