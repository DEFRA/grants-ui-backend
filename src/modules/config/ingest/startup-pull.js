import { fetchAllGrants, fetchVersion, fetchLatestActiveVersion } from './broker-client.js'
import { ingestVersion } from './ingest.js'
import { definitionStatusKey, getDefinitionStatuses, updateDefinitionStatus } from '../config.repository.js'
import { FORM_DEFINITION_STATUS } from '../config.constants.js'
import { ingestAllowlist } from '../../allowlist/ingest-allowlist.js'
import { log, LogCodes } from '../../../common/helpers/logging/log.js'

/**
 * Pulls a single grant version from the broker and upserts it into Mongo.
 *
 * @param {object} grant
 * @param {object} versionSummary
 * @param {Map<string, string>} existingStatuses map of stored statuses keyed by {@link definitionStatusKey}
 * @returns {Promise<boolean>} true if the version was upserted, false if it was skipped
 */
async function pullVersion(grant, versionSummary, existingStatuses) {
  const [major, minor, patch] = (versionSummary.version ?? '').split('.').map(Number)
  const key = definitionStatusKey(grant.grant, major, minor, patch)
  const versionExists = existingStatuses.has(key)
  const existingStatus = existingStatuses.get(key)
  if (existingStatus === versionSummary.status) {
    log(LogCodes.CONFIG.STARTUP_PULL_SKIP, {
      grantCode: grant.grant,
      version: versionSummary.version,
      status: versionSummary.status
    })
    return false
  }

  // The version is already stored but the broker reports a different status.
  // Nothing else about the version can change, so update the status (and
  // lastUpdated) in place rather than re-fetching the full version.
  if (versionExists) {
    await updateDefinitionStatus({
      grantCode: grant.grant,
      major,
      minor,
      patch,
      status: versionSummary.status,
      updatedAt: new Date(versionSummary.lastUpdated)
    })
    return true
  }

  const fullVersion = await fetchVersion(grant.grant, versionSummary.version)
  await ingestVersion({
    grantCode: fullVersion.grant,
    version: fullVersion.version,
    status: fullVersion.status,
    bucket: fullVersion.path,
    manifest: fullVersion.manifest,
    updatedAt: new Date(fullVersion.lastUpdated)
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
 * @param {Map<string, string>} existingStatuses map of stored statuses keyed by {@link definitionStatusKey}
 * @returns {Promise<'upserted' | 'skipped' | 'failed'>}
 */
async function pullVersionSafely(grant, versionSummary, existingStatuses) {
  try {
    return (await pullVersion(grant, versionSummary, existingStatuses)) ? 'upserted' : 'skipped'
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
 * After all form definitions are ingested, ingests the allowlist for the
 * latest active version of each grant.
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
    throw new TypeError('Broker /api/allGrants did not return an array')
  }

  // Batch-load the stored status of every version in a single query so we do
  // not issue one Mongo round-trip per version while deciding what to pull.
  const existingStatuses = await getDefinitionStatuses(grants.map((grant) => grant.grant))

  let total = 0
  let upserted = 0
  let failed = 0

  for (const grant of grants) {
    for (const versionSummary of grant.versions ?? []) {
      total += 1
      const result = await pullVersionSafely(grant, versionSummary, existingStatuses)
      if (result === 'upserted') {
        upserted += 1
      } else if (result === 'failed') {
        failed += 1
      } else {
        // skipped — no action needed
      }
    }
  }

  // Ingest the allowlist for the latest active version of each grant.
  // Done after the version loop so form definitions are fully up to date first.
  for (const grant of grants) {
    const hasActiveVersion = (grant.versions ?? []).some((v) => v.status === FORM_DEFINITION_STATUS.ACTIVE)
    if (!hasActiveVersion) {
      continue
    }

    try {
      const latestActive = await fetchLatestActiveVersion(grant.grant)
      await ingestAllowlist({
        grantCode: latestActive.grant,
        version: latestActive.version,
        bucket: latestActive.path,
        manifest: latestActive.manifest
      })
    } catch (err) {
      log(LogCodes.ALLOWLIST.STARTUP_PULL_FAILED, {
        grantCode: grant.grant,
        errorName: err.name,
        errorMessage: err.message,
        stack: err.stack
      })
    }
  }

  log(LogCodes.CONFIG.STARTUP_PULL_COMPLETE, { total, upserted, failed })
  return { total, upserted, failed }
}
