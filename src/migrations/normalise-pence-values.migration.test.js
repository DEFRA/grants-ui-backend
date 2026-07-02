/**
 * Tests for the migration that normalises pence fields affected by upstream
 * JavaScript floating point multiplication.
 */
import { MongoClient } from 'mongodb'
import { up } from '~/migrations/state/20260702000000-normalise-pence-values.js'

const COLLECTION = 'state__grant_application_state'

describe('normalise-pence-values migration', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('normalise-pence-values-migration-test')
  })

  afterAll(async () => {
    await connection.close()
  })

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({})
  })

  test('normalises all known pence paths and preserves unrelated state', async () => {
    await db.collection(COLLECTION).insertOne({
      _id: 'affected',
      state: {
        totalPence: 1998.9999999999998,
        payment: {
          agreementTotalPence: 2998.9999999999995,
          agreementLevelItems: [
            {
              activeTierRatePence: 1998.9999999999998,
              agreementTotalPence: 499.00000000000006,
              label: 'first'
            },
            {
              activeTierRatePence: 2500,
              agreementTotalPence: 1000.0000000000001
            },
            { label: 'missing-pence-fields' },
            'not-an-object'
          ],
          payments: [
            {
              totalPaymentPence: 1998.9999999999998,
              lineItems: [
                { paymentPence: 1998.9999999999998, description: 'fee' },
                { paymentPence: 299.00000000000006 },
                { description: 'missing-payment-pence' }
              ]
            },
            {
              totalPaymentPence: 500,
              lineItems: 'not-an-array'
            },
            'not-an-object'
          ]
        },
        otherDecimal: 12.345,
        otherObject: { total: 1998.9999999999998 }
      }
    })

    await up(db)

    const doc = await db.collection(COLLECTION).findOne({ _id: 'affected' })

    expect(doc.state).toEqual({
      totalPence: 1999,
      payment: {
        agreementTotalPence: 2999,
        agreementLevelItems: [
          {
            activeTierRatePence: 1999,
            agreementTotalPence: 499,
            label: 'first'
          },
          {
            activeTierRatePence: 2500,
            agreementTotalPence: 1000
          },
          { label: 'missing-pence-fields' },
          'not-an-object'
        ],
        payments: [
          {
            totalPaymentPence: 1999,
            lineItems: [
              { paymentPence: 1999, description: 'fee' },
              { paymentPence: 299 },
              { description: 'missing-payment-pence' }
            ]
          },
          {
            totalPaymentPence: 500,
            lineItems: 'not-an-array'
          },
          'not-an-object'
        ]
      },
      otherDecimal: 12.345,
      otherObject: { total: 1998.9999999999998 }
    })
  })

  test('is idempotent and leaves documents without affected numeric pence values untouched', async () => {
    await db.collection(COLLECTION).insertMany([
      {
        _id: 'already-normalised',
        state: {
          totalPence: 1999,
          payment: {
            agreementTotalPence: 2999,
            agreementLevelItems: [{ activeTierRatePence: 1999, agreementTotalPence: 499 }],
            payments: [{ totalPaymentPence: 1999, lineItems: [{ paymentPence: 1999 }] }]
          }
        }
      },
      {
        _id: 'unrelated',
        state: {
          total: 1998.9999999999998,
          payment: {
            notes: [{ amount: 1998.9999999999998 }]
          }
        }
      }
    ])

    await up(db)
    const afterFirstRun = await db.collection(COLLECTION).find({}).sort({ _id: 1 }).toArray()

    await up(db)
    const afterSecondRun = await db.collection(COLLECTION).find({}).sort({ _id: 1 }).toArray()

    expect(afterSecondRun).toEqual(afterFirstRun)
    expect(afterSecondRun.find((doc) => doc._id === 'unrelated').state).toEqual({
      total: 1998.9999999999998,
      payment: {
        notes: [{ amount: 1998.9999999999998 }]
      }
    })
  })

  test('normalises root totalPence without creating missing nested payment fields', async () => {
    await db.collection(COLLECTION).insertOne({
      _id: 'root-only',
      state: {
        totalPence: 1998.9999999999998,
        label: 'root-only'
      }
    })

    await up(db)

    const doc = await db.collection(COLLECTION).findOne({ _id: 'root-only' })
    expect(doc.state).toEqual({
      totalPence: 1999,
      label: 'root-only'
    })
  })
})
