import Hapi from '@hapi/hapi'
import { applicationsList } from './state.routes.js'
import { listApplications } from './state.service.js'
import { extractLockKeys } from './lock-enforcement.js'
import { listApplicationStates, findSubmissions } from './state.repository.js'

jest.mock('./state.repository.js', () => ({
  listApplicationStates: jest.fn(),
  findSubmissions: jest.fn()
}))
jest.mock('./lock-enforcement.js', () => ({ extractLockKeys: jest.fn() }))
jest.mock('../../common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: { STATE: { STATE_RETRIEVE_FAILED: 'STATE_RETRIEVE_FAILED' } }
}))

const scope = { sbi: 'test-business', grantCode: 'test-grant' }

beforeEach(() => {
  jest.clearAllMocks()
  listApplicationStates.mockResolvedValue([])
  findSubmissions.mockResolvedValue([])
})

test('returns metadata for drafts, submitted and reopened applications without exposing answers', async () => {
  listApplicationStates.mockResolvedValue([
    { applicationRef: 'REF-D', grantVersion: '1.0.0', createdAt: '2026-01-01', state: {} },
    { applicationRef: 'REF-S', state: { applicationStatus: 'SUBMITTED', secretAnswer: 'private' } },
    { legacyReferenceNumber: 'REF-R', state: { applicationStatus: 'REOPENED', submittedAt: '2026-02-01' } }
  ])
  findSubmissions.mockResolvedValue([
    { referenceNumber: 'REF-S', submittedAt: '2026-03-01' },
    { referenceNumber: 'REF-S', submittedAt: '2026-02-01' }
  ])
  const applications = await listApplications(scope)
  expect(listApplicationStates).toHaveBeenCalledWith(scope)
  expect(findSubmissions).toHaveBeenCalledWith(scope)
  expect(applications).toEqual([
    expect.objectContaining({ applicationRef: 'REF-D', applicationStatus: null, submittedAt: null }),
    expect.objectContaining({ referenceNumber: 'REF-S', applicationStatus: 'SUBMITTED', submittedAt: '2026-03-01' }),
    expect.objectContaining({ applicationRef: 'REF-R', applicationStatus: 'REOPENED', submittedAt: '2026-02-01' })
  ])
  expect(JSON.stringify(applications)).not.toContain('private')
})

describe('GET /applications', () => {
  let server
  let credentials
  beforeEach(async () => {
    credentials = { crn: 'test-user', sbi: scope.sbi }
    server = Hapi.server()
    server.auth.scheme('test', () => ({
      authenticate: (_request, h) => h.authenticated({ credentials })
    }))
    server.auth.strategy('bearer', 'test')
    server.route(applicationsList)
    await server.initialize()
  })
  afterEach(async () => server.stop())

  test('returns an empty list without acquiring an edit lock', async () => {
    const response = await server.inject('/applications?grantCode=test-grant')
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({ applications: [] })
    expect(applicationsList.options.pre).toBeUndefined()
    expect(extractLockKeys).not.toHaveBeenCalled()
    expect(listApplicationStates).toHaveBeenCalledWith(scope)
  })

  test.each([{ crn: 'test-user' }, { sbi: 'test-business' }, {}])(
    'rejects missing user identity: %j',
    async (identity) => {
      credentials = identity
      const response = await server.inject('/applications?grantCode=test-grant')
      expect(response.statusCode).toBe(401)
      expect(listApplicationStates).not.toHaveBeenCalled()
    }
  )

  test.each([
    '/applications',
    '/applications?grantCode=test-grant&sbi=other-business',
    '/applications?grantCode=test-grant&extra=z'
  ])('rejects invalid queries including caller-supplied SBI: %s', async (url) => {
    expect((await server.inject(url)).statusCode).toBe(400)
    expect(listApplicationStates).not.toHaveBeenCalled()
  })

  test('returns 500 when persistence fails', async () => {
    listApplicationStates.mockRejectedValue(new Error('Database unavailable'))
    const response = await server.inject('/applications?grantCode=test-grant')
    expect(response.statusCode).toBe(500)
    expect(response.result).toEqual({ error: 'Failed to list applications' })
  })
})
