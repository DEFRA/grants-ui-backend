import { upsertDefinition } from '../config.repository.js'
import { getYamlObject } from '../../../common/helpers/s3.js'
import { buildFormDefinition } from './transform.js'
import { log, LogCodes } from '../../../common/helpers/logging/log.js'

/**
 * Fetches a form definition from S3, transforms it, and upserts it into Mongo.
 *
 * @param {Object} params
 * @param {string} params.grantCode
 * @param {string} params.version
 * @param {string} params.bucket - S3 bucket containing the manifest objects
 * @param {string} [params.status]
 * @param {string[]} params.manifest
 * @param {Date} [params.updatedAt]
 * @returns {Promise<void>}
 */
export async function ingestVersion({ grantCode, version, bucket, status, manifest, updatedAt }) {
  if (!grantCode || !version || !bucket) {
    log(LogCodes.CONFIG.INGEST_MISSING_PARAMS, { grantCode, version, bucket })
    return
  }
  if (!Array.isArray(manifest) || manifest.length === 0) {
    log(LogCodes.CONFIG.INGEST_EMPTY_MANIFEST, { grantCode, version })
    return
  }

  const grantDefinitionPath = manifest.find((path) => path === `${grantCode}/${version}/grants-ui/${grantCode}.yaml`)
  if (!grantDefinitionPath) {
    log(LogCodes.CONFIG.INGEST_MANIFEST_MISSING_ENTRY, { grantCode, version })
    return
  }

  const definition = await getYamlObject(bucket, grantDefinitionPath)
  const formDefinition = buildFormDefinition({ grantCode, version, status, definition, updatedAt })

  await upsertDefinition(formDefinition)

  log(LogCodes.CONFIG.INGEST_UPSERTED, { grantCode, version, status: formDefinition.status, grantDefinitionPath })
}
