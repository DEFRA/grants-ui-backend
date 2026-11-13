import { down, up } from '~/migrations/state/20261113000000-report-unsubmitted-woodland-applications.js'
import { setupMigrationTestContext } from '../test-helpers/migration-test-context.js'

const COLLECTION = 'state__grant_application_state'

describe('report-unsubmitted-woodland-applications migration', () => {
  const context = setupMigrationTestContext({
    dbName: 'report-unsubmitted-woodland-applications-migration-test',
    collection: COLLECTION
  })

  const insert = (...documents) => context.db.collection(COLLECTION).insertMany(documents)
  const findAll = () => context.db.collection(COLLECTION).find({}).sort({ _id: 1 }).toArray()
  const reportRecords = () =>
    context.consoleInfo.mock.calls
      .map(([message]) => message)
      .filter((message) => message.includes('{'))
      .map((message) => JSON.parse(message.slice(message.indexOf('{'))))

  test('reports every non-submitted woodland application without exposing sensitive fields', async () => {
    const documents = [
      {
        _id: 'sbi-sensitive-800000904-private',
        applicationRef: 'APP-MISSING-STATUS',
        grantCode: 'woodland',
        sbi: 800000904,
        state: {
          totalPence: 321,
          hectaresTenOrOverYearsOld: 0,
          hectaresUnderTenYearsOld: 0,
          privateMarker: 'do-not-log'
        }
      },
      {
        _id: 'null-status',
        grantCode: 'woodland',
        sbi: '123400005',
        state: {
          applicationStatus: null,
          payment: { agreementTotalPence: 0 },
          totalPence: 999,
          hectaresTenOrOverYearsOld: null,
          hectaresUnderTenYearsOld: 2.5,
          $$__referenceNumber: 'APP-STATE-REF',
          crn: 'CRN-PRIVATE'
        }
      },
      {
        _id: 'reopened',
        applicationRef: null,
        grantCode: 'woodland',
        sbi: '80A000904',
        state: {
          applicationStatus: 'REOPENED',
          payment: { agreementTotalPence: 123 },
          totalPence: 999,
          hectaresUnderTenYearsOld: 4
        }
      },
      {
        _id: 'cleared',
        grantCode: 'woodland',
        sbi: '1234',
        state: { applicationStatus: 'CLEARED' }
      },
      {
        _id: 'purged',
        grantCode: 'woodland',
        state: { applicationStatus: 'PURGED' }
      },
      {
        _id: 'submitted',
        applicationRef: 'APP-SUBMITTED',
        grantCode: 'woodland',
        sbi: '800000905',
        state: { applicationStatus: 'SUBMITTED', totalPence: 700 }
      },
      {
        _id: 'other-grant',
        applicationRef: 'APP-OTHER-GRANT',
        grantCode: 'hedgerows',
        sbi: '800000906',
        state: { applicationStatus: 'REOPENED', totalPence: 701 }
      }
    ]
    await insert(...documents)
    const before = await findAll()

    await up(context.db)

    expect(reportRecords()).toHaveLength(5)
    expect(reportRecords()).toEqual(
      expect.arrayContaining([
        {
          applicationStatus: 'CLEARED',
          calculatedPaymentPence: null,
          hectaresTenOrOverYearsOld: null,
          hectaresUnderTenYearsOld: null,
          applicationRef: null,
          flaggedForReview: false,
          redactedSbi: '*****1234'
        },
        {
          applicationStatus: null,
          calculatedPaymentPence: 321,
          hectaresTenOrOverYearsOld: 0,
          hectaresUnderTenYearsOld: 0,
          flaggedForReview: false,
          applicationRef: 'APP-MISSING-STATUS',
          redactedSbi: '*****0904'
        },
        {
          applicationStatus: null,
          calculatedPaymentPence: 0,
          hectaresTenOrOverYearsOld: null,
          hectaresUnderTenYearsOld: 2.5,
          flaggedForReview: false,
          applicationRef: 'APP-STATE-REF',
          redactedSbi: '*****0005'
        },
        {
          applicationStatus: 'PURGED',
          calculatedPaymentPence: null,
          hectaresTenOrOverYearsOld: null,
          hectaresUnderTenYearsOld: null,
          flaggedForReview: false,
          applicationRef: null,
          redactedSbi: null
        },
        {
          applicationStatus: 'REOPENED',
          calculatedPaymentPence: 123,
          hectaresTenOrOverYearsOld: null,
          hectaresUnderTenYearsOld: 4,
          flaggedForReview: false,
          applicationRef: null,
          redactedSbi: '*****0904'
        }
      ])
    )

    expect(context.consoleInfo).toHaveBeenCalledWith(expect.stringMatching(/reported=5$/))
    const output = context.consoleInfo.mock.calls.flat().join(' ')
    expect(output).not.toContain('800000904')
    expect(output).not.toContain('80A000904')
    expect(output).not.toContain('CRN-PRIVATE')
    expect(output).not.toContain('do-not-log')
    expect(output).not.toContain('sbi-sensitive-800000904-private')
    expect(await findAll()).toEqual(before)

    await down(context.db)

    expect(await findAll()).toEqual(before)
  })

  test('flags an application for review when older woodland exceeds 20% of younger woodland', async () => {
    await insert({
      _id: 'flagged-for-review',
      applicationRef: 'APP-FLAGGED-FOR-REVIEW',
      grantCode: 'woodland',
      state: {
        applicationStatus: 'REOPENED',
        hectaresTenOrOverYearsOld: 2.1,
        hectaresUnderTenYearsOld: 10
      }
    })

    await up(context.db)

    expect(reportRecords()).toEqual([
      expect.objectContaining({
        applicationRef: 'APP-FLAGGED-FOR-REVIEW',
        flaggedForReview: true
      })
    ])
  })

  test.each([
    { hectaresTenOrOverYearsOld: 2, hectaresUnderTenYearsOld: 10, flaggedForReview: false },
    { hectaresTenOrOverYearsOld: 1.9, hectaresUnderTenYearsOld: 10, flaggedForReview: false },
    { hectaresTenOrOverYearsOld: 1, hectaresUnderTenYearsOld: 0, flaggedForReview: true },
    { hectaresTenOrOverYearsOld: 0, hectaresUnderTenYearsOld: 10, flaggedForReview: false },
    { hectaresTenOrOverYearsOld: 0, hectaresUnderTenYearsOld: 0, flaggedForReview: false }
  ])(
    'reports flaggedForReview=$flaggedForReview for older area $hectaresTenOrOverYearsOld and younger area $hectaresUnderTenYearsOld',
    async ({ hectaresTenOrOverYearsOld, hectaresUnderTenYearsOld, flaggedForReview }) => {
      await insert({
        _id: 'review-threshold',
        grantCode: 'woodland',
        state: {
          applicationStatus: 'REOPENED',
          hectaresTenOrOverYearsOld,
          hectaresUnderTenYearsOld
        }
      })
      const before = await findAll()

      await up(context.db)

      expect(reportRecords()).toEqual([
        expect.objectContaining({
          hectaresTenOrOverYearsOld,
          hectaresUnderTenYearsOld,
          flaggedForReview
        })
      ])
      expect(await findAll()).toEqual(before)
    }
  )

  test('reports an empty dataset with a zero summary', async () => {
    await up(context.db)

    expect(reportRecords()).toEqual([])
    expect(context.consoleInfo).toHaveBeenCalledWith(expect.stringMatching(/reported=0$/))

    await down(context.db)
  })
})
