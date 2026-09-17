import https from 'node:https'
import http from 'node:http'
import Wreck from '@hapi/wreck'
import { config } from '../../../config.js'
import { setupProxy } from './setup-proxy.js'

describe('setupProxy', () => {
  const originalWreckAgents = { ...Wreck.agents }

  afterEach(() => {
    config.set('httpProxy', null)
    Wreck.agents = { ...originalWreckAgents }
  })

  test('Should not point Wreck at the native agents if the environment variable is not set', () => {
    config.set('httpProxy', null)
    setupProxy()

    expect(Wreck.agents.https).not.toBe(https.globalAgent)
    expect(Wreck.agents.http).not.toBe(http.globalAgent)
  })

  test('Should point Wreck at the native agents if the environment variable is set', () => {
    config.set('httpProxy', 'http://localhost:3128')
    setupProxy()

    expect(Wreck.agents.https).toBe(https.globalAgent)
    expect(Wreck.agents.http).toBe(http.globalAgent)
  })
})
