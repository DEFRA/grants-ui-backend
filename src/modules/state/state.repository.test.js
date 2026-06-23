import {
  initStateRepository,
  saveApplicationState,
  getApplicationState,
  deleteApplicationState,
  patchApplicationState,
  insertSubmission,
  findSubmissions,
  getLatestApplicationStateForGrant,
  updateApplicationStateVersion
} from './state.repository.js'

// Note: index creation is owned by migrate-mongo migrations and is verified in
// `src/migrations/create-indexes.migration.test.js`.

describe('state.repository CRUD error paths', () => {
  const params = { sbi: '123456789', grantCode: 'EGWA', grantVersion: '1.0.0' }
  const dbError = Object.assign(new Error('DB failed'), { name: 'MongoServerError', code: 999 })

  afterEach(() => {
    initStateRepository(null)
  })

  test('saveApplicationState re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        updateOne: () => {
          throw dbError
        }
      })
    })
    await expect(saveApplicationState({ ...params, state: {} })).rejects.toThrow('DB failed')
  })

  test('getApplicationState re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        findOne: () => {
          throw dbError
        }
      })
    })
    await expect(getApplicationState(params)).rejects.toThrow('DB failed')
  })

  test('deleteApplicationState re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        findOneAndDelete: () => {
          throw dbError
        }
      })
    })
    await expect(deleteApplicationState(params)).rejects.toThrow('DB failed')
  })

  test('patchApplicationState re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        findOneAndUpdate: () => {
          throw dbError
        }
      })
    })
    await expect(patchApplicationState({ ...params, applicationStatus: 'submitted' })).rejects.toThrow('DB failed')
  })

  test('insertSubmission re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        insertOne: () => {
          throw dbError
        }
      })
    })
    await expect(
      insertSubmission({
        sbi: '123',
        grantCode: 'EGWA',
        grantVersion: '1.0.0',
        referenceNumber: 'R1',
        submittedAt: new Date()
      })
    ).rejects.toThrow('DB failed')
  })

  test('findSubmissions re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        find: () => {
          throw dbError
        }
      })
    })
    await expect(findSubmissions({ sbi: '123' })).rejects.toThrow('DB failed')
  })

  test('getLatestApplicationStateForGrant re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        find: () => ({
          sort: () => ({
            limit: () => ({
              next: () => {
                throw dbError
              }
            })
          })
        })
      })
    })
    await expect(getLatestApplicationStateForGrant({ sbi: '123', grantCode: 'EGWA' })).rejects.toThrow('DB failed')
  })

  test('updateApplicationStateVersion re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        findOneAndUpdate: () => {
          throw dbError
        }
      })
    })
    await expect(
      updateApplicationStateVersion({ _id: 'abc', grantVersion: '1.2.0', major: 1, minor: 2, patch: 0 })
    ).rejects.toThrow('DB failed')
  })
})

describe('state.repository cross-version helpers', () => {
  afterEach(() => {
    initStateRepository(null)
  })

  test('getLatestApplicationStateForGrant returns the highest-semver doc', async () => {
    const topDoc = { _id: 'top', sbi: '123', grantCode: 'EGWA', grantVersion: '2.3.1' }
    const sort = jest.fn().mockReturnValue({
      limit: () => ({ next: () => Promise.resolve(topDoc) })
    })
    const find = jest.fn().mockReturnValue({ sort })
    initStateRepository({ collection: () => ({ find }) })

    const result = await getLatestApplicationStateForGrant({ sbi: '123', grantCode: 'EGWA' })

    expect(find).toHaveBeenCalledWith({ sbi: '123', grantCode: 'EGWA' })
    expect(sort).toHaveBeenCalledWith({ major: -1, minor: -1, patch: -1 })
    expect(result).toBe(topDoc)
  })

  test('updateApplicationStateVersion sets version fields + updatedAt and returns the updated doc', async () => {
    const updated = { _id: 'abc', grantVersion: '1.2.0', major: 1, minor: 2, patch: 0 }
    const findOneAndUpdate = jest.fn().mockResolvedValue(updated)
    initStateRepository({ collection: () => ({ findOneAndUpdate }) })

    const result = await updateApplicationStateVersion({
      _id: 'abc',
      grantVersion: '1.2.0',
      major: 1,
      minor: 2,
      patch: 0
    })

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'abc' },
      {
        $set: { grantVersion: '1.2.0', major: 1, minor: 2, patch: 0 },
        $currentDate: { updatedAt: true }
      },
      { returnDocument: 'after' }
    )
    expect(result).toBe(updated)
  })
})
