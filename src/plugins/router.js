import { health } from '../routes/health.js'
import { stateSave, stateRetrieve, stateDelete } from '../routes/state.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, stateSave, stateRetrieve, stateDelete])
    }
  }
}

export { router }
