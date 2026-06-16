import { LRUCache } from 'lru-cache'
import { config } from '../../config.js'
import { findGrantCodesByEntry, findGrantCodesWithAllowlist } from './allowlist.repository.js'
import { getAllActiveGrants } from '../config/config.repository.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

export const allowlistCache = new LRUCache({ max: 500, ttl: 2 * 60 * 1000 })

/**
 * @typedef {{ grantCode: string, title: string, description: string|null, urls: Record<string,string>|null }} GrantMeta
 */

/**
 * Returns the grants accessible to a user based on the allowlist for the
 * current environment, with title, description and resolved url.
 *
 * Rules:
 * - A user must appear in BOTH the crn list AND the sbi list for a grant.
 * - Grants with no allowlist entries for the current env are open to all users.
 *
 * @param {string} crn
 * @param {string} sbi
 * @returns {Promise<Array<{ code: string, title: string, description: string|null, url: string|null }>>}
 */
export async function resolveAllowedGrants(crn, sbi) {
  const cacheKey = `${crn}:${sbi}`
  const cached = allowlistCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const env = config.get('cdpEnvironment')

  const [allActiveGrants, crnMatches, sbiMatches, grantsWithAllowlist] = await Promise.all([
    getAllActiveGrants(),
    findGrantCodesByEntry('crn', String(crn), env),
    findGrantCodesByEntry('sbi', String(sbi), env),
    findGrantCodesWithAllowlist(env)
  ])

  const crnSet = new Set(crnMatches)
  const sbiSet = new Set(sbiMatches)
  const restrictedSet = new Set(grantsWithAllowlist)

  const allowed = allActiveGrants.filter(({ grantCode }) => {
    if (!restrictedSet.has(grantCode)) {
      return true
    }
    return crnSet.has(grantCode) && sbiSet.has(grantCode)
  })

  log(LogCodes.ALLOWLIST.GRANTS_CHECKED, { crn, sbi, env, matchedCount: allowed.length })

  const grantsUiBaseUrl = config.get('grantsUiBaseUrl')

  const result = allowed.map(({ grantCode, title, description }) => ({
    code: grantCode,
    title,
    description,
    url: grantsUiBaseUrl ? `${grantsUiBaseUrl}/${grantCode}` : null
  }))

  allowlistCache.set(cacheKey, result)
  return result
}
