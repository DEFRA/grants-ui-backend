import { health } from '../routes/health.js'
import { applicationLockRelease, applicationLocksRelease } from '../modules/state/locks.routes.js'
import {
  stateSave,
  stateRetrieve,
  stateDelete,
  statePatch,
  stateWithDefinition
} from '../modules/state/state.routes.js'
import { addSubmission, retrieveSubmissions } from '../modules/state/submissions.routes.js'
import { allowlistGrants } from '../modules/allowlist/allowlist.routes.js'
import { clearTestDataRoute } from '../modules/state/test-data.routes.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([
        health,
        stateSave,
        stateRetrieve,
        stateDelete,
        stateWithDefinition,
        addSubmission,
        retrieveSubmissions,
        statePatch,
        applicationLockRelease,
        applicationLocksRelease,
        allowlistGrants,
        clearTestDataRoute
      ])
    }
  }
}

export { router }
