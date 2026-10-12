import { replaceAllowlistEntries } from './allowlist.repository.js'
import { buildAllowlistEntries } from './allowlist.transform.js'
import { getYamlObject } from '../../common/helpers/s3.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { config } from '../../config.js'

/**
 * Fetches allowlist.yaml from S3 for the given grant version and replaces all
 * allowlist entries for that grant in Mongo.
 * Missing files or empty entries for the current environment preserve the
 * existing entries; they cannot be used to revoke access.
 *
 * Should only be called for active versions — callers are responsible for
 * checking status before calling.
 *
 * @param {Object} params
 * @param {string} params.grantCode
 * @param {string} params.version
 * @param {string} params.bucket
 * @param {string[]} params.manifest
 * @returns {Promise<void>}
 */
export async function ingestAllowlist({ grantCode, version, bucket, manifest }) {
  const allowlistPath = manifest.find((path) => path === `${grantCode}/${version}/grants-ui/allowlist.yaml`)

  if (!allowlistPath) {
    log(LogCodes.ALLOWLIST.INGEST_FILE_MISSING, { grantCode, version })
    return
  }

  const env = config.get('cdpEnvironment')
  const allowlist = await getYamlObject(bucket, allowlistPath, { allowEmpty: true })
  const envBlock = allowlist?.[env]

  const entries = buildAllowlistEntries(grantCode, envBlock)
  if (entries.length === 0) {
    log(LogCodes.ALLOWLIST.INGEST_EMPTY, { grantCode, version })
    return
  }

  await replaceAllowlistEntries(grantCode, entries)

  log(LogCodes.ALLOWLIST.INGEST_UPSERTED, { grantCode, version, status: 'active', entryCount: entries.length })
}
