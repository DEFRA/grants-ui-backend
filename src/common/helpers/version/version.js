export function parsePurgeConfig(value) {
  if (!value?.trim()) {
    return []
  }

  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(':')

      if (separatorIndex === -1) {
        throw new Error(`Invalid purge rule '${entry}'. Expected format grantCode:versionRule`)
      }

      return {
        grantCode: entry.slice(0, separatorIndex).trim(),
        rule: entry.slice(separatorIndex + 1).trim()
      }
    })
}
