import { FORM_DEFINITION_STATUS } from '../config.constants.js'

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/

/**
 * Parses a semver string into its parts.
 * Throws if the string is not a valid `major.minor.patch`.
 *
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number }}
 */
export function parseSemver(version) {
  const match = SEMVER_RE.exec(version)
  if (!match) {
    throw new Error(`Invalid semver string: ${version}`)
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}

/**
 * Coerces a broker status string into a FORM_DEFINITION_STATUS value.
 * Unknown statuses default to DRAFT to avoid serving partial config as live.
 *
 * @param {string|undefined} status
 * @returns {string}
 */
export function coerceStatus(status) {
  return status === FORM_DEFINITION_STATUS.ACTIVE ? FORM_DEFINITION_STATUS.ACTIVE : FORM_DEFINITION_STATUS.DRAFT
}

/**
 * Builds a FormDefinition document ready for upsert from broker metadata
 * and the raw definition body fetched from S3.
 *
 * @param {Object} params
 * @param {string} params.grantCode
 * @param {string} params.version
 * @param {string} [params.status]
 * @param {Record<string, unknown>} params.definition
 * @param {string|Date} [params.updatedAt]
 * @returns {import('../config.repository.js').FormDefinition}
 */
export function buildFormDefinition({ grantCode, version, status, definition, updatedAt }) {
  const { major, minor, patch } = parseSemver(version)
  return {
    grantCode,
    id: definition?.metadata?.id ?? `${grantCode}@${version}`,
    title: definition?.name ?? grantCode,
    major,
    minor,
    patch,
    status: coerceStatus(status),
    definition,
    updatedAt: updatedAt ? new Date(updatedAt) : new Date()
  }
}
