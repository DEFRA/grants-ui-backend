import { health } from '../routes/health.js'
import { example } from '../routes/example.js'
import { stateSave } from '../routes/state.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, ...example, stateSave])
    }
  }
}

export { router }
