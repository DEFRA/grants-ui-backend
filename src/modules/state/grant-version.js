/**
 * Shared grantVersion normalisation for the state module.
 *
 * grantVersion is exclusively a semver string (`major.minor.patch`). Some
 * callers (e.g. lock tokens minted by grants-ui) may still supply the legacy
 * integer `1` (or a bare major like `"2"`). This helper coerces any such value
 * to a semver string and exposes the decomposed parts so they can be persisted
 * alongside the version for version-aware querying.
 */

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/
const MAJOR_ONLY_RE = /^(\d+)$/
const SAFE_DEFAULT_VERSION = '1.0.0'
const SAFE_DEFAULT_MAJOR = 1

/**
 * Normalises a raw grantVersion value into a semver string and its parts.
 * Falls back to safe defaults (`1.0.0`) if the value cannot be parsed.
 *
 * @param {unknown} raw
 * @returns {{ grantVersion: string, pinnedMajor: number, major: number, minor: number, patch: number }}
 */
export function normaliseGrantVersion(raw) {
  if (typeof raw === 'string') {
    const full = SEMVER_RE.exec(raw)
    if (full) {
      return decompose(raw, Number(full[1]), Number(full[2]), Number(full[3]))
    }
    const majorOnly = MAJOR_ONLY_RE.exec(raw)
    if (majorOnly) {
      const major = Number(majorOnly[1])
      return decompose(`${major}.0.0`, major, 0, 0)
    }
  }

  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) {
    return decompose(`${raw}.0.0`, raw, 0, 0)
  }

  return decompose(SAFE_DEFAULT_VERSION, SAFE_DEFAULT_MAJOR, 0, 0)
}

/**
 * @param {string} grantVersion
 * @param {number} major
 * @param {number} minor
 * @param {number} patch
 */
function decompose(grantVersion, major, minor, patch) {
  return { grantVersion, pinnedMajor: major, major, minor, patch }
}
