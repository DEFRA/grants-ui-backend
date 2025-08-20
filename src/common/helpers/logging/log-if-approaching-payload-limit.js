import { log, LogCodes } from '~/src/common/helpers/logging/log.js'

/**
 * Logs a warning if the request payload size exceeds a warning threshold.
 * Assumes the route will reject payloads larger than `maxBytes`.
 *
 * @param {Hapi.Request} request - The Hapi request object
 * @param {Object} options
 * @param {number} options.threshold - Bytes above which to log a warning (e.g. 500_000)
 * @param {number} options.max - Max payload size allowed by route (e.g. 1_048_576 for 1MB)
 */
export function logIfApproachingPayloadLimit(request, { threshold, max }) {
  const payloadSize = Buffer.byteLength(JSON.stringify(request.payload || {}))

  log(LogCodes.STATE.STATE_PAYLOAD_SIZE, {
    payloadSize
  })

  if (payloadSize > threshold && payloadSize <= max) {
    log(LogCodes.STATE.STATE_PAYLOAD_SIZE_FAILED, {
      payloadSize,
      threshold,
      max,
      path: request.path,
      userId: request.payload?.userId || 'unknown'
    })
  }
}
