import { LRUCache } from 'lru-cache'
import { findGrantCodesByEntry, findGrantCodesWithAllowlist } from './allowlist.repository.js'
import { getAllActiveGrants } from '../config/config.repository.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { config } from '../../config.js'

export const allowlistCache = new LRUCache({ max: 500, ttl: 2 * 60 * 1000 })

/**
 * @typedef {{ grantCode: string, title: string, description: string|null, urls: Record<string,string>|null }} GrantMeta
 */

/**
 * Returns the grants accessible to a user based on the allowlist, with title,
 * description and resolved url.
 *
 * Rules:
 * - Grants with no allowlist entries are closed to all users.
 * - Grants with allowAll: true are open to all users.
 * - Otherwise a user must appear in the sbi list.
 *
 * @param {string} sbi
 * @returns {Promise<Array<{ code: string, title: string, description: string|null, url: string|null }>>}
 */
export async function resolveAllowedGrants(sbi) {
  const cacheKey = String(sbi)
  const cached = allowlistCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const [allActiveGrants, sbiMatches, grantsWithAllowlist] = await Promise.all([
    getAllActiveGrants(),
    findGrantCodesByEntry('sbi', String(sbi)),
    findGrantCodesWithAllowlist()
  ])

  const sbiSet = new Set(sbiMatches)

  const allowed = allActiveGrants.filter(({ grantCode }) => {
    const allowlist = grantsWithAllowlist.get(grantCode)
    if (!allowlist) {
      return false
    }
    if (allowlist.allowAll) {
      return true
    }
    return sbiSet.has(grantCode)
  })

  log(LogCodes.ALLOWLIST.GRANTS_CHECKED, { sbi, matchedCount: allowed.length })

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
