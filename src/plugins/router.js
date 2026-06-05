import { health } from '../routes/health.js'
import { applicationLockRelease, applicationLocksRelease } from '../modules/state/locks.routes.js'
import {
  stateSave,
  stateRetrieve,
  stateDocumentRetrieve,
  stateDelete,
  statePatch
} from '../modules/state/state.routes.js'
import { addSubmission, retrieveSubmissions } from '../modules/state/submissions.routes.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([
        health,
        stateSave,
        stateRetrieve,
        stateDocumentRetrieve,
        stateDelete,
        addSubmission,
        retrieveSubmissions,
        statePatch,
        applicationLockRelease,
        applicationLocksRelease
      ])
    }
  }
}

export { router }
