import { upsertDefinition } from '../config.repository.js'
import { getYamlObject } from './s3-client.js'
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
 * @param {string|Date} [params.updatedAt]
 * @returns {Promise<void>}
 */
export async function ingestVersion({ grantCode, version, bucket, status, manifest, updatedAt }) {
  if (!grantCode || !version || !bucket) {
    throw new Error('ingestVersion requires grantCode, version and bucket')
  }
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error(`No manifest provided for ${grantCode}@${version}`)
  }

  const grantDefinitionPath = manifest.find((path) => path.endsWith(`${grantCode}.yaml`))
  if (!grantDefinitionPath) {
    throw new Error(`Manifest for ${grantCode}@${version} contains no entry matching ${grantCode}.yaml`)
  }

  const definition = await getYamlObject(bucket, grantDefinitionPath)
  const formDefinition = buildFormDefinition({ grantCode, version, status, definition, updatedAt })

  await upsertDefinition(formDefinition)

  log(LogCodes.CONFIG.INGEST_UPSERTED, { grantCode, version, status: formDefinition.status, grantDefinitionPath })
}
