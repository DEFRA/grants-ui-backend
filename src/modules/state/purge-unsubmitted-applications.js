import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { purgeApplications } from './state.service.js'
import { config } from '../../config.js'
import { parsePurgeConfig } from '~/src/common/helpers/version/version.js'

export async function runStartupPurge() {
  const purgeRules = parsePurgeConfig(config.get('purge.applications'))

  if (!purgeRules?.length) {
    log(LogCodes.PURGE.SKIPPED, {
      reason: 'no-rules-configured'
    })
    return
  }
  console.log(`Running startup purge for ${purgeRules.length} rules: ${JSON.stringify(purgeRules)}`)

  for (const { grantCode, rule } of purgeRules) {
    try {
      log(LogCodes.PURGE.STARTED, {
        grantCode,
        rule
      })

      const purgedCount = await purgeApplications({
        grantCode,
        versionRule: rule
      })

      log(LogCodes.PURGE.COMPLETED, {
        grantCode,
        rule,
        purgedCount
      })
    } catch (err) {
      log(LogCodes.PURGE.FAILED, {
        grantCode,
        rule,
        errorName: err.name,
        errorMessage: err.message,
        errorReason: err.reason,
        errorCode: err.code,
        isMongoError: err?.name?.startsWith('Mongo'),
        stack: err.stack?.split('\n')[0]
      })
    }
  }
}
