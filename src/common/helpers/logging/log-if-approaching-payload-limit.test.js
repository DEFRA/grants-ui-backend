import { logIfApproachingPayloadLimit } from './log-if-approaching-payload-limit.js'

describe('#logIfApproachingPayloadLimit', () => {
  let mockRequest
  let mockLogger

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn()
    }

    mockRequest = {
      payload: { userId: 'test-user', data: 'test-data' },
      path: '/test-path',
      server: {
        logger: mockLogger
      }
    }
  })

  test('should log payload size info', () => {
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringMatching(/^Received payload of size: \d+ bytes$/))
  })

  test('should log warning when payload exceeds threshold but within max', () => {
    const largePayload = 'x'.repeat(1500)
    mockRequest.payload = { userId: 'test-user', data: largePayload }
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Large payload approaching limit'))
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('userId=test-user'))
  })

  test('should not log warning when payload is below threshold', () => {
    const smallPayload = 'x'.repeat(100)
    mockRequest.payload = { userId: 'test-user', data: smallPayload }
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  test('should handle empty payload', () => {
    mockRequest.payload = null
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(mockLogger.info).toHaveBeenCalledWith('Received payload of size: 2 bytes')
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  test('should handle undefined payload', () => {
    delete mockRequest.payload
    const options = { threshold: 1000, max: 2000 }

    logIfApproachingPayloadLimit(mockRequest, options)

    expect(mockLogger.info).toHaveBeenCalledWith('Received payload of size: 2 bytes')
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })
})
