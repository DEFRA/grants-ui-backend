import { fetchAllGrants, fetchVersion } from './broker-client.js'
import { ingestVersion } from './ingest.js'
import { getDefinition } from '../config.repository.js'
import { log, LogCodes } from '../../../common/helpers/logging/log.js'

/**
 * Pulls a single grant version from the broker and upserts it into Mongo.
 *
 * @param {object} grant
 * @param {object} versionSummary
 * @returns {Promise<boolean>} true if the version was upserted, false if it was skipped
 */
async function pullVersion(grant, versionSummary) {
  const [major, minor, patch] = (versionSummary.version ?? '').split('.').map(Number)
  const existing = await getDefinition(grant.grant, major, minor, patch)
  if (existing?.status === versionSummary.status) {
    log(LogCodes.CONFIG.STARTUP_PULL_SKIP, {
      grantCode: grant.grant,
      version: versionSummary.version,
      status: versionSummary.status
    })
    return false
  }

  const fullVersion = await fetchVersion(grant.grant, versionSummary.version)
  await ingestVersion({
    grantCode: fullVersion.grant,
    version: fullVersion.version,
    status: fullVersion.status,
    bucket: fullVersion.path,
    manifest: fullVersion.manifest,
    updatedAt: fullVersion.lastUpdated
  })
  return true
}

/**
 * Pulls a single version, translating the outcome into a result string.
 *
 * Failures are logged but swallowed so that the rest of the pull can continue.
 *
 * @param {object} grant
 * @param {object} versionSummary
 * @returns {Promise<'upserted' | 'skipped' | 'failed'>}
 */
async function pullVersionSafely(grant, versionSummary) {
  try {
    return (await pullVersion(grant, versionSummary)) ? 'upserted' : 'skipped'
  } catch (err) {
    log(LogCodes.CONFIG.STARTUP_PULL_VERSION_FAILED, {
      grantCode: grant.grant,
      version: versionSummary.version,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack
    })
    return 'failed'
  }
}

/**
 * Pulls every grant version from the broker and upserts each into Mongo.
 *
 * Failures for individual versions are logged but do not abort the rest of
 * the pull — we want the server to come up with as much current data as the
 * broker can provide.
 *
 * @returns {Promise<{ total: number, upserted: number, failed: number }>}
 */
export async function runStartupPull() {
  log(LogCodes.CONFIG.STARTUP_PULL_START, {})

  const grants = await fetchAllGrants()
  if (!Array.isArray(grants)) {
    throw new Error('Broker /api/allGrants did not return an array')
  }

  let total = 0
  let upserted = 0
  let failed = 0

  for (const grant of grants) {
    for (const versionSummary of grant.versions ?? []) {
      total += 1
      const result = await pullVersionSafely(grant, versionSummary)
      if (result === 'upserted') {
        upserted += 1
      } else if (result === 'failed') {
        failed += 1
      }
    }
  }

  log(LogCodes.CONFIG.STARTUP_PULL_COMPLETE, { total, upserted, failed })
  return { total, upserted, failed }
}
