import { health } from '../routes/health.js'
import { applicationLockRelease, applicationLocksRelease } from '../modules/state/locks.routes.js'
import { stateSave, stateRetrieve, stateDelete, statePatch } from '../modules/state/state.routes.js'
import { addSubmission, retrieveSubmissions } from '../modules/state/submissions.routes.js'
import { allowlistGrants } from '../modules/allowlist/allowlist.routes.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([
        health,
        stateSave,
        stateRetrieve,
        stateDelete,
        addSubmission,
        retrieveSubmissions,
        statePatch,
        applicationLockRelease,
        applicationLocksRelease,
        allowlistGrants
      ])
    }
  }
}

export { router }
