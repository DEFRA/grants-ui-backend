/**
 * Flattens the allowlist entry for the current environment into individual
 * entry documents, one per (grantCode, type, value).
 *
 * allowlist.yaml env block structure:
 *   allowAll: true          # everyone is allowed; crns/sbis are ignored
 *   crns: ['111', '222']
 *   sbis: ['333', '444']
 *
 * @param {string} grantCode
 * @param {{ allowAll?: boolean, crns?: string[], sbis?: string[] } | null | undefined} envBlock - the env-specific block from the parsed YAML
 * @returns {import('./allowlist.repository.js').AllowlistEntry[]}
 */
export function buildAllowlistEntries(grantCode, envBlock) {
  const entries = []
  const updatedAt = new Date()

  if (envBlock?.allowAll === true) {
    entries.push({ grantCode, type: 'allowAll', value: 'true', updatedAt })
    return entries
  }

  for (const crn of Array.isArray(envBlock?.crns) ? envBlock.crns : []) {
    // String() guards against YAML parsers auto-coercing numeric-looking values to numbers
    entries.push({ grantCode, type: 'crn', value: String(crn), updatedAt })
  }
  for (const sbi of Array.isArray(envBlock?.sbis) ? envBlock.sbis : []) {
    entries.push({ grantCode, type: 'sbi', value: String(sbi), updatedAt })
  }

  return entries
}
