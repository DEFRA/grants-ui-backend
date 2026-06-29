import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load as loadYaml } from 'js-yaml'
import Inert from '@hapi/inert'
import getSwaggerUiPath from 'swagger-ui-dist/absolute-path.js'
import { config } from '../config.js'

const swaggerUiPath = getSwaggerUiPath()

const swaggerInitializer = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '/swagger.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    plugins: [SwaggerUIBundle.plugins.DownloadUrl],
    layout: 'StandaloneLayout'
  })
}`

const openapi = {
  plugin: {
    name: 'openapi',
    register: async (server) => {
      const specPath = resolve(process.cwd(), 'openapi.yaml')
      let spec
      try {
        spec = loadYaml(readFileSync(specPath, 'utf-8'))
        if (!spec || typeof spec !== 'object') {
          throw new Error('openapi.yaml parsed to an empty or non-object value')
        }
      } catch (err) {
        throw new Error(`Failed to load OpenAPI spec from ${specPath}: ${err.message}`)
      }

      const serviceVersion = config.get('serviceVersion')
      if (serviceVersion) {
        spec.info.version = serviceVersion
      }

      delete spec.servers

      const swaggerIndexHtml = readFileSync(`${swaggerUiPath}/index.html`, 'utf-8').replace(
        '<head>',
        '<head><base href="/documentation/">'
      )

      await server.register(Inert)

      server.route({
        method: 'GET',
        path: '/swagger.json',
        options: { auth: false },
        handler: (_request, h) => h.response(spec).type('application/json')
      })

      server.route({
        method: 'GET',
        path: '/documentation',
        options: { auth: false },
        handler: (_request, h) => h.response(swaggerIndexHtml).type('text/html')
      })

      server.route({
        method: 'GET',
        path: '/documentation/swagger-initializer.js',
        options: { auth: false },
        handler: (_request, h) => h.response(swaggerInitializer).type('application/javascript')
      })

      server.route({
        method: 'GET',
        path: '/documentation/{param*}',
        options: { auth: false },
        handler: {
          directory: {
            path: swaggerUiPath,
            index: ['index.html']
          }
        }
      })
    }
  }
}

export { openapi }
