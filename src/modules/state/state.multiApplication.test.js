/**
 * Integration tests for multi-application support: saving/retrieving more
 * than one application per (sbi, grantCode) when the resolved grant config
 * declares `allowMultipleApplications: true`, and confirming standard
 * (single-application) schemes are entirely unaffected.
 *
 * Exercises the real repository against the in-memory Mongo instance (no
 * service/repository mocking) so the partial-unique-index behaviour and the
 * saveApplicationState/getApplicationState wiring are all verified
 * together, end to end.
 */
import { MongoClient } from 'mongodb'
import { initStateRepository } from './state.repository.js'
import { initConfigRepository } from '../config/config.repository.js'
import {
  saveApplicationState,
  getApplicationState,
  getStateWithFormDefinition,
  patchApplicationState,
  deleteApplicationState
} from './state.service.js'
import { updateApplicationStateVersion } from './state.repository.js'
import { up as upMultiApplicationIndexes } from '~/migrations/state/20260924000000-multi-application-indexes.js'

const STATE_COLLECTION = 'state__grant_application_state'
const CONFIG_COLLECTION = 'config__form_definitions'

describe('multi-application save/retrieve', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('multi-application-test')
    initStateRepository(db)
    initConfigRepository(db)
    // Drop first so the migrations build indexes from a clean slate:
    // createIndex is a no-op against an existing index of the same name, so a
    // collection left over from a previous run would keep its old key shape.
    await db
      .collection(STATE_COLLECTION)
      .drop()
      .catch(() => {})
    await upMultiApplicationIndexes(db)
  })

  afterAll(async () => {
    await connection.close()
  })

  beforeEach(async () => {
    await db.collection(STATE_COLLECTION).deleteMany({})
    await db.collection(CONFIG_COLLECTION).deleteMany({})
  })

  async function insertDefinition({ grantCode, major = 1, minor = 0, patch = 0, allowMultipleApplications }) {
    await db.collection(CONFIG_COLLECTION).insertOne({
      grantCode,
      id: `${grantCode}-id`,
      title: grantCode,
      status: 'active',
      major,
      minor,
      patch,
      allowMultipleApplications,
      definition: {},
      updatedAt: new Date()
    })
  }

  describe('standard scheme (allowMultipleApplications: false / absent) — unchanged behaviour', () => {
    test('saving twice for the same sbi/grantCode overwrites the single document, never creates a second one', async () => {
      await insertDefinition({ grantCode: 'standard-grant', allowMultipleApplications: false })

      await saveApplicationState({
        sbi: '111',
        grantCode: 'standard-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A', answer: 'first' }
      })
      await saveApplicationState({
        sbi: '111',
        grantCode: 'standard-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B', answer: 'second' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '111', grantCode: 'standard-grant' }).toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0].state.answer).toBe('second')
      expect(docs[0].applicationRef).toBe('REF-B')
      expect(docs[0].allowMultipleApplications).toBe(false)
    })

    test('behaves identically when no form definition exists at all (allowMultipleApplications absent)', async () => {
      await saveApplicationState({
        sbi: '112',
        grantCode: 'unconfigured-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A' }
      })
      await saveApplicationState({
        sbi: '112',
        grantCode: 'unconfigured-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '112', grantCode: 'unconfigured-grant' }).toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0].applicationRef).toBe('REF-B')
    })

    test('getApplicationState retrieves the single document by sbi/grantCode/grantVersion', async () => {
      await insertDefinition({ grantCode: 'standard-grant', allowMultipleApplications: false })
      await saveApplicationState({
        sbi: '111',
        grantCode: 'standard-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A' }
      })

      const result = await getApplicationState({ sbi: '111', grantCode: 'standard-grant', grantVersion: '1.0.0' })
      expect(result.applicationRef).toBe('REF-A')
    })

    test('stores exactly one document for the sbi/grantCode', async () => {
      await insertDefinition({ grantCode: 'standard-grant', allowMultipleApplications: false })
      await saveApplicationState({
        sbi: '111',
        grantCode: 'standard-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '111', grantCode: 'standard-grant' }).toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0].applicationRef).toBe('REF-A')
    })
  })

  describe('multi-application scheme (allowMultipleApplications: true)', () => {
    test('saving with two different applicationRefs creates two independent documents', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })

      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A', answer: 'application A' }
      })
      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B', answer: 'application B' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '222', grantCode: 'multi-grant' }).toArray()
      expect(docs).toHaveLength(2)
      expect(docs.map((d) => d.applicationRef).sort()).toEqual(['REF-A', 'REF-B'])
    })

    test('re-saving with the same applicationRef updates that application in place, not a third document', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })

      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A', answer: 'first draft' }
      })
      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B', answer: 'other application' }
      })
      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A', answer: 'updated draft' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '222', grantCode: 'multi-grant' }).toArray()
      expect(docs).toHaveLength(2)
      const refA = docs.find((d) => d.applicationRef === 'REF-A')
      expect(refA.state.answer).toBe('updated draft')
    })

    test('applications are retained regardless of applicationStatus (draft and submitted both persist independently)', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })

      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A', applicationStatus: 'SUBMITTED' }
      })
      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B', applicationStatus: 'DRAFT' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '222', grantCode: 'multi-grant' }).toArray()
      expect(docs).toHaveLength(2)
      expect(docs.map((d) => d.state.applicationStatus).sort()).toEqual(['DRAFT', 'SUBMITTED'])
    })

    test('getApplicationState with applicationRef retrieves the exact application', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })
      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A', answer: 'A' }
      })
      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B', answer: 'B' }
      })

      const result = await getApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        applicationRef: 'REF-B'
      })
      expect(result.state.answer).toBe('B')
    })

    test('stores one document per applicationRef for the sbi', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })
      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A' }
      })
      await saveApplicationState({
        sbi: '222',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '222', grantCode: 'multi-grant' }).toArray()
      expect(docs).toHaveLength(2)
    })

    test('a version upgrade of one application does not duplicate a sibling application on its next save', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })

      await saveApplicationState({
        sbi: '224',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A', answer: 'A' }
      })
      await saveApplicationState({
        sbi: '224',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B', answer: 'B' }
      })

      // A definition bump lands and getStateWithFormDefinition upgrades one
      // application (whichever the latest-version lookup returns) in place.
      const appA = await db.collection(STATE_COLLECTION).findOne({ sbi: '224', applicationRef: 'REF-A' })
      await updateApplicationStateVersion({ _id: appA._id, grantVersion: '1.1.0', major: 1, minor: 1, patch: 0 })

      // grants-ui now saves the sibling application at the newly resolved version.
      await saveApplicationState({
        sbi: '224',
        grantCode: 'multi-grant',
        grantVersion: '1.1.0',
        state: { $$__referenceNumber: 'REF-B', answer: 'B updated' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '224', grantCode: 'multi-grant' }).toArray()
      expect(docs).toHaveLength(2)

      const refB = docs.filter((d) => d.applicationRef === 'REF-B')
      expect(refB).toHaveLength(1)
      expect(refB[0].state.answer).toBe('B updated')
      expect(refB[0].grantVersion).toBe('1.1.0')
    })

    test('a save with no applicationRef does not create a null-ref document', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })

      await saveApplicationState({
        sbi: '225',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { answer: 'no ref' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '225', grantCode: 'multi-grant' }).toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0].applicationRef).toBeUndefined()
    })

    test('enabling the flag on a grant with an in-flight application keeps that application, rather than stranding it', async () => {
      // The application is first saved while the grant is still
      // single-application, then the grant's config is switched on.
      await insertDefinition({ grantCode: 'flipping-grant', allowMultipleApplications: false })
      await saveApplicationState({
        sbi: '226',
        grantCode: 'flipping-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-EXISTING', answer: 'in progress' }
      })

      await db
        .collection(CONFIG_COLLECTION)
        .updateOne({ grantCode: 'flipping-grant' }, { $set: { allowMultipleApplications: true } })

      // The applicant resumes: their existing application must be updated in
      // place and adopt the new flag, not duplicated under a new document.
      await saveApplicationState({
        sbi: '226',
        grantCode: 'flipping-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-EXISTING', answer: 'resumed' }
      })

      let docs = await db.collection(STATE_COLLECTION).find({ sbi: '226', grantCode: 'flipping-grant' }).toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0].allowMultipleApplications).toBe(true)
      expect(docs[0].state.answer).toBe('resumed')

      // And they can now start a second application alongside it.
      await saveApplicationState({
        sbi: '226',
        grantCode: 'flipping-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-SECOND', answer: 'second application' }
      })

      docs = await db.collection(STATE_COLLECTION).find({ sbi: '226', grantCode: 'flipping-grant' }).toArray()
      expect(docs).toHaveLength(2)
      expect(docs.map((d) => d.applicationRef).sort()).toEqual(['REF-EXISTING', 'REF-SECOND'])
    })

    test('a pre-release document (ref only nested in state) survives the flag being enabled, once migrated', async () => {
      await insertDefinition({ grantCode: 'legacy-grant', allowMultipleApplications: true })

      // Written before this release: no top-level applicationRef or flag,
      // the reference exists only inside the opaque state payload.
      await db.collection(STATE_COLLECTION).insertOne({
        sbi: '227',
        grantCode: 'legacy-grant',
        grantVersion: '1.0.0',
        major: 1,
        minor: 0,
        patch: 0,
        pinnedMajor: 1,
        state: { $$__referenceNumber: 'REF-LEGACY', answer: 'in progress' },
        createdAt: new Date(),
        updatedAt: new Date()
      })

      await upMultiApplicationIndexes(db)

      await saveApplicationState({
        sbi: '227',
        grantCode: 'legacy-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-LEGACY', answer: 'resumed' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '227', grantCode: 'legacy-grant' }).toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0].applicationRef).toBe('REF-LEGACY')
      expect(docs[0].state.answer).toBe('resumed')
    })

    test('getStateWithFormDefinition opens the named application rather than an arbitrary one', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })
      await saveApplicationState({
        sbi: '230',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A', answer: 'A' }
      })
      await saveApplicationState({
        sbi: '230',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B', answer: 'B' }
      })

      const result = await getStateWithFormDefinition({
        sbi: '230',
        grantCode: 'multi-grant',
        ownerId: 'user-1',
        includeDefinition: false,
        applicationRef: 'REF-B'
      })

      expect(result.state.applicationRef).toBe('REF-B')
      expect(result.state.state.answer).toBe('B')
    })

    test('patching applicationStatus targets only the named application', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })
      await saveApplicationState({
        sbi: '228',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A', applicationStatus: 'DRAFT' }
      })
      await saveApplicationState({
        sbi: '228',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B', applicationStatus: 'DRAFT' }
      })

      await patchApplicationState({
        sbi: '228',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        applicationStatus: 'SUBMITTED',
        applicationRef: 'REF-B'
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '228' }).sort({ applicationRef: 1 }).toArray()
      expect(docs.map((d) => [d.applicationRef, d.state.applicationStatus])).toEqual([
        ['REF-A', 'DRAFT'],
        ['REF-B', 'SUBMITTED']
      ])
    })

    test('deleting targets only the named application', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })
      await saveApplicationState({
        sbi: '229',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A' }
      })
      await saveApplicationState({
        sbi: '229',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-B' }
      })

      await deleteApplicationState({
        sbi: '229',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        applicationRef: 'REF-A'
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '229' }).toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0].applicationRef).toBe('REF-B')
    })

    test('stores a single document when the sbi has only one application', async () => {
      await insertDefinition({ grantCode: 'multi-grant', allowMultipleApplications: true })
      await saveApplicationState({
        sbi: '223',
        grantCode: 'multi-grant',
        grantVersion: '1.0.0',
        state: { $$__referenceNumber: 'REF-A' }
      })

      const docs = await db.collection(STATE_COLLECTION).find({ sbi: '223', grantCode: 'multi-grant' }).toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0].applicationRef).toBe('REF-A')
    })
  })
})
