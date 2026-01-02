import { health } from '../routes/health.js'
import { applicationLockRelease } from '../routes/lock.js'
import { stateSave, stateRetrieve, stateDelete, statePatch } from '../routes/state.js'
import { addSubmission, retrieveSubmissions } from '../routes/submissions.js'

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
        applicationLockRelease
      ])
    }
  }
}

export { router }
