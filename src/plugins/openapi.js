import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load as loadYaml } from 'js-yaml'
import Inert from '@hapi/inert'
import getSwaggerUiPath from 'swagger-ui-dist/absolute-path.js'
import { config } from '../config.js'

const swaggerUiPath = getSwaggerUiPath()

const filterInternalEndpoints = (spec) => {
  const isInternal = (tag) => tag['x-internal'] === true

  const internalTags = new Set((spec.tags ?? []).filter(isInternal).map((t) => t.name))
  const paths = Object.fromEntries(
    Object.entries(spec.paths).filter(([, methods]) =>
      Object.values(methods).every((op) => !op.tags?.some((t) => internalTags.has(t)))
    )
  )
  const tags = (spec.tags ?? []).filter((t) => !isInternal(t))

  const reachable = new Set()
  if (spec.components?.schemas) {
    const addRefs = (obj) =>
      JSON.stringify(obj, (k, v) => {
        if (k === '$ref') {
          const name = v.replace('#/components/schemas/', '')
          if (!reachable.has(name)) {
            reachable.add(name)
            addRefs(spec.components.schemas[name])
          }
        }
        return v
      })
    addRefs(paths)
  }
  const components = spec.components
    ? {
        ...spec.components,
        ...(spec.components.schemas && {
          schemas: Object.fromEntries(Object.entries(spec.components.schemas).filter(([name]) => reachable.has(name)))
        }),
        ...(spec.components.securitySchemes && {
          securitySchemes: Object.fromEntries(
            Object.entries(spec.components.securitySchemes).filter(([, scheme]) => !isInternal(scheme))
          )
        })
      }
    : undefined

  return { ...spec, paths, tags, ...(components && { components }) }
}

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

      spec = filterInternalEndpoints(spec)

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
