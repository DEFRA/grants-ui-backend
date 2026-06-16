/**
 * Flattens a parsed allowlist.yaml body into individual entry documents,
 * one per (grantCode, env, type, value).
 *
 * allowlist.yaml structure:
 *   dev:
 *     crns: ['111', '222']
 *     sbis: ['333', '444']
 *   prod:
 *     crns: [...]
 *     sbis: [...]
 *
 * @param {string} grantCode
 * @param {Record<string, { crns?: string[], sbis?: string[] }>} allowlist - parsed YAML body
 * @returns {import('./allowlist.repository.js').AllowlistEntry[]}
 */
export function buildAllowlistEntries(grantCode, allowlist) {
  const entries = []
  const updatedAt = new Date()

  for (const [env, lists] of Object.entries(allowlist ?? {})) {
    for (const crn of lists?.crns ?? []) {
      // String() guards against YAML parsers auto-coercing numeric-looking values to numbers
      entries.push({ grantCode, env, type: 'crn', value: String(crn), updatedAt })
    }
    for (const sbi of lists?.sbis ?? []) {
      entries.push({ grantCode, env, type: 'sbi', value: String(sbi), updatedAt })
    }
  }

  return entries
}
