import {
  initStateRepository,
  saveApplicationState,
  getApplicationState,
  deleteApplicationState,
  patchApplicationState,
  insertSubmission,
  findSubmissions,
  getLatestApplicationStateForGrant,
  updateApplicationStateVersion,
  purgeApplicationStates,
  findUnsubmittedApplicationStates
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

  test('saveApplicationState filters on (sbi, grantCode, grantVersion) alone when allowMultipleApplications is false', async () => {
    const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 0 })
    initStateRepository({ collection: () => ({ updateOne }) })

    await saveApplicationState({ ...params, state: {}, allowMultipleApplications: false, applicationRef: 'ref-1' })

    const [filter] = updateOne.mock.calls[0]
    expect(filter).toEqual({ sbi: params.sbi, grantCode: params.grantCode, grantVersion: params.grantVersion })
  })

  test('saveApplicationState defaults to allowMultipleApplications false when omitted', async () => {
    const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 0 })
    initStateRepository({ collection: () => ({ updateOne }) })

    await saveApplicationState({ ...params, state: {} })

    const [filter, updateDoc] = updateOne.mock.calls[0]
    expect(filter).toEqual({ sbi: params.sbi, grantCode: params.grantCode, grantVersion: params.grantVersion })
    expect(updateDoc.$set.allowMultipleApplications).toBe(false)
  })

  test('saveApplicationState keys on (sbi, grantCode, applicationRef) when allowMultipleApplications is true', async () => {
    const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 1 })
    initStateRepository({ collection: () => ({ updateOne }) })

    await saveApplicationState({ ...params, state: {}, allowMultipleApplications: true, applicationRef: 'ref-1' })

    const [filter, updateDoc] = updateOne.mock.calls[0]
    expect(filter).toEqual({ sbi: params.sbi, grantCode: params.grantCode, applicationRef: 'ref-1' })
    expect(filter.grantVersion).toBeUndefined()
    expect(updateDoc.$set.allowMultipleApplications).toBe(true)
    expect(updateDoc.$set.applicationRef).toBe('ref-1')
  })

  test('saveApplicationState persists grantVersion via $set for multi-application saves', async () => {
    const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 0 })
    initStateRepository({ collection: () => ({ updateOne }) })

    await saveApplicationState({
      ...params,
      grantVersion: '2.3.4',
      state: {},
      allowMultipleApplications: true,
      applicationRef: 'ref-1'
    })

    const [, updateDoc] = updateOne.mock.calls[0]
    expect(updateDoc.$set).toMatchObject({ grantVersion: '2.3.4', major: 2, minor: 3, patch: 4 })
    expect(updateDoc.$setOnInsert.major).toBeUndefined()
    expect(updateDoc.$setOnInsert.pinnedMajor).toBe(2)
  })

  test('saveApplicationState falls back to the single-application key when a multi-application save has no applicationRef', async () => {
    const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 0 })
    initStateRepository({ collection: () => ({ updateOne }) })

    await saveApplicationState({ ...params, state: {}, allowMultipleApplications: true })

    const [filter, updateDoc] = updateOne.mock.calls[0]
    expect(filter).toEqual({ sbi: params.sbi, grantCode: params.grantCode, grantVersion: params.grantVersion })
    expect(updateDoc.$set.applicationRef).toBeUndefined()
  })

  test('saveApplicationState does not write a null applicationRef', async () => {
    const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 0 })
    initStateRepository({ collection: () => ({ updateOne }) })

    await saveApplicationState({ ...params, state: {}, allowMultipleApplications: true, applicationRef: null })

    const [filter, updateDoc] = updateOne.mock.calls[0]
    expect(filter).toEqual({ sbi: params.sbi, grantCode: params.grantCode, grantVersion: params.grantVersion })
    expect('applicationRef' in updateDoc.$set).toBe(false)
  })

  test('saveApplicationState sets allowMultipleApplications and applicationRef on $set', async () => {
    const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 1 })
    initStateRepository({ collection: () => ({ updateOne }) })

    await saveApplicationState({
      ...params,
      state: { foo: 'bar' },
      allowMultipleApplications: true,
      applicationRef: 'ref-1'
    })

    const [, updateDoc] = updateOne.mock.calls[0]
    expect(updateDoc.$set.state).toEqual({ foo: 'bar' })
    expect(updateDoc.$set.allowMultipleApplications).toBe(true)
    expect(updateDoc.$set.applicationRef).toBe('ref-1')
  })

  test('getApplicationState omits applicationRef from the filter when not supplied', async () => {
    const findOne = jest.fn().mockResolvedValue(null)
    initStateRepository({ collection: () => ({ findOne }) })

    await getApplicationState(params)

    expect(findOne).toHaveBeenCalledWith({
      sbi: params.sbi,
      grantCode: params.grantCode,
      grantVersion: params.grantVersion
    })
  })

  test('getApplicationState includes applicationRef in the filter when supplied', async () => {
    const findOne = jest.fn().mockResolvedValue(null)
    initStateRepository({ collection: () => ({ findOne }) })

    await getApplicationState({ ...params, applicationRef: 'ref-1' })

    expect(findOne).toHaveBeenCalledWith({ ...params, applicationRef: 'ref-1' })
  })

  test('getLatestApplicationStateForGrant narrows to one application when applicationRef is supplied', async () => {
    const doc = { _id: 'a', applicationRef: 'ref-1' }
    const sort = jest.fn().mockReturnValue({ limit: () => ({ next: () => Promise.resolve(doc) }) })
    const find = jest.fn().mockReturnValue({ sort })
    initStateRepository({ collection: () => ({ find }) })

    await getLatestApplicationStateForGrant({ sbi: '123', grantCode: 'EGWA', applicationRef: 'ref-1' })

    expect(find).toHaveBeenCalledWith({ sbi: '123', grantCode: 'EGWA', applicationRef: 'ref-1' })
  })

  test('getLatestApplicationStateForGrant omits applicationRef from the filter when not supplied', async () => {
    const sort = jest.fn().mockReturnValue({ limit: () => ({ next: () => Promise.resolve(null) }) })
    const find = jest.fn().mockReturnValue({ sort })
    initStateRepository({ collection: () => ({ find }) })

    await getLatestApplicationStateForGrant({ sbi: '123', grantCode: 'EGWA' })

    expect(find).toHaveBeenCalledWith({ sbi: '123', grantCode: 'EGWA' })
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

  test('findUnsubmittedApplicationStates returns non-submitted applications', async () => {
    const expected = [
      {
        _id: '1',
        grantCode: 'ffc',
        state: {
          applicationStatus: 'DRAFT'
        }
      }
    ]

    const toArray = jest.fn().mockResolvedValue(expected)

    initStateRepository({
      collection: () => ({
        find: jest.fn().mockReturnValue({
          toArray
        })
      })
    })

    const result = await findUnsubmittedApplicationStates({
      grantCode: 'ffc'
    })

    expect(result).toEqual(expected)
  })

  test('findUnsubmittedApplicationStates excludes submitted applications', async () => {
    const toArray = jest.fn().mockResolvedValue([])

    initStateRepository({
      collection: () => ({
        find: jest.fn().mockReturnValue({ toArray })
      })
    })

    const result = await findUnsubmittedApplicationStates({
      grantCode: 'ffc'
    })

    expect(result).toEqual([])
  })

  test('findUnsubmittedApplicationStates filters by grantCode', async () => {
    const toArray = jest.fn().mockResolvedValue([])

    const find = jest.fn().mockReturnValue({
      toArray
    })

    initStateRepository({
      collection: () => ({
        find
      })
    })

    await findUnsubmittedApplicationStates({
      grantCode: 'ffc'
    })

    expect(find).toHaveBeenCalledWith({
      grantCode: 'ffc',
      'state.applicationStatus': {
        $nin: ['SUBMITTED', 'PURGED']
      }
    })
  })

  test('purgeApplicationStates marks applications as PURGED', async () => {
    const updateMany = jest.fn().mockResolvedValue({
      modifiedCount: 1
    })

    initStateRepository({
      collection: () => ({
        updateMany
      })
    })

    const ids = ['abc']

    const result = await purgeApplicationStates(ids)

    expect(updateMany).toHaveBeenCalledWith(
      {
        _id: { $in: ids }
      },
      {
        $set: {
          'state.applicationStatus': 'PURGED'
        },
        $currentDate: {
          updatedAt: true
        }
      }
    )

    expect(result.modifiedCount).toBe(1)
  })

  test('purgeApplicationStates updates multiple applications', async () => {
    const updateMany = jest.fn().mockResolvedValue({
      modifiedCount: 2
    })

    initStateRepository({
      collection: () => ({
        updateMany
      })
    })

    const ids = ['abc', 'efg']

    const result = await purgeApplicationStates(ids)

    expect(updateMany).toHaveBeenCalledWith(
      {
        _id: { $in: ids }
      },
      {
        $set: {
          'state.applicationStatus': 'PURGED'
        },
        $currentDate: {
          updatedAt: true
        }
      }
    )

    expect(result.modifiedCount).toBe(2)
  })

  test('purgeApplicationStates handles empty id list', async () => {
    const updateMany = jest.fn().mockResolvedValue({
      modifiedCount: 0
    })

    initStateRepository({
      collection: () => ({
        updateMany
      })
    })

    const result = await purgeApplicationStates([])

    expect(updateMany).toHaveBeenCalledWith(
      {
        _id: { $in: [] }
      },
      {
        $set: {
          'state.applicationStatus': 'PURGED'
        },
        $currentDate: {
          updatedAt: true
        }
      }
    )

    expect(result.modifiedCount).toBe(0)
  })
})
