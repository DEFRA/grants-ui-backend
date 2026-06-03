import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { load as loadYaml } from 'js-yaml'
import { config } from '../../../config.js'

let s3Client

/**
 * Returns a lazily-created shared S3 client.
 * @returns {S3Client}
 */
export function getS3Client() {
  if (s3Client) {
    return s3Client
  }

  const endpointUrl = config.get('aws.endpointUrl')

  s3Client = new S3Client({
    region: config.get('aws.region'),
    ...(endpointUrl ? { endpoint: endpointUrl, forcePathStyle: true } : {})
  })

  return s3Client
}

/**
 * Fetches an S3 object's body and parses it as YAML.
 *
 * @param {string} bucket
 * @param {string} key
 * @returns {Promise<unknown>}
 */
export async function getYamlObject(bucket, key) {
  const response = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = await response.Body.transformToString('utf-8')
  return loadYaml(body)
}

/**
 * Resets the cached S3 client. Test-only helper.
 */
export function _resetS3ClientForTests() {
  s3Client = null
}
