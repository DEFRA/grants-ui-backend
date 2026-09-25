import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { findFeatureControl } from './feature-control.repository.js'

export const featureControlValue = {
  method: 'GET',
  path: '/feature-controls/{name}',
  options: {
    auth: 'bearer'
  },
  handler: async (request, h) => {
    const featureControl = await findFeatureControl(request.params.name.toUpperCase())

    if (typeof featureControl?.value !== 'boolean') {
      throw Boom.notFound(`Feature control not found: ${request.params.name}`)
    }

    return h.response(featureControl.value).code(StatusCodes.OK)
  }
}
