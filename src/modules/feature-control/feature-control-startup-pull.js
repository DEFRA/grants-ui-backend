import { fetchFeatureControls } from '../config/ingest/broker-client.js'
import { storeFeatureControl } from './ingest-feature-control.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

const PAGE_SIZE = 100

/**
 * Stores one broker item, logging rather than throwing on failure so a single
 * bad control cannot stop the rest of the pull.
 *
 * @param {{ name: string, type: string, value: unknown, scopes?: string[] }} item
 * @returns {Promise<'stored' | 'skipped' | 'failed'>}
 */
async function storeItemSafely(item) {
  try {
    const wasStored = await storeFeatureControl({
      name: item.name,
      valueType: item.type,
      scopes: item.scopes ?? [],
      value: item.value
    })
    return wasStored ? 'stored' : 'skipped'
  } catch (err) {
    log(LogCodes.FEATURE_CONTROL.STARTUP_PULL_ITEM_FAILED, {
      name: item.name,
      errorName: err.name,
      errorMessage: err.message
    })
    return 'failed'
  }
}

/**
 * Best-effort backfill of active feature controls from the config-broker.
 *
 * The broker only broadcasts on change, so a fresh or emptied database holds no
 * values until this runs. Controls that are withdrawn, expired or removed are
 * never broadcast; they are not fetched here either.
 *
 * @returns {Promise<{ total: number, stored: number, failed: number }>}
 */
export async function runFeatureControlStartupPull() {
  const outcomes = { stored: 0, skipped: 0, failed: 0 }
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const response = await fetchFeatureControls(page, PAGE_SIZE)

    if (!Array.isArray(response?.items)) {
      throw new TypeError('Broker feature-controls response did not contain an items array')
    }

    totalPages = response.totalPages ?? 1

    for (const item of response.items) {
      outcomes[await storeItemSafely(item)]++
    }

    page++
  }

  const summary = {
    total: outcomes.stored + outcomes.skipped + outcomes.failed,
    stored: outcomes.stored,
    failed: outcomes.failed
  }
  log(LogCodes.FEATURE_CONTROL.STARTUP_PULL_COMPLETE, summary)
  return summary
}
