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
  let consoleInfo

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('normalise-pence-values-migration-test')
  })

  afterAll(async () => {
    await connection.close()
  })

  beforeEach(async () => {
    consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {})
    await db.collection(COLLECTION).deleteMany({})
  })

  afterEach(() => {
    consoleInfo.mockRestore()
  })

  test('reports affected record count and ids before updating only those records', async () => {
    const order = []
    const affectedRecords = [{ _id: 'affected' }, { _id: 'woodlands-wmp' }]
    const toArray = jest.fn().mockResolvedValue(affectedRecords)
    const sort = jest.fn().mockReturnValue({ toArray })
    const project = jest.fn().mockReturnValue({ sort })
    const find = jest.fn().mockReturnValue({ project })
    const updateMany = jest.fn().mockImplementation(async () => {
      order.push('updateMany')
    })
    const collection = { find, updateMany }
    const fakeDb = { collection: jest.fn().mockReturnValue(collection) }
    consoleInfo.mockImplementation(() => {
      order.push('console.info')
    })

    await up(fakeDb)

    expect(fakeDb.collection).toHaveBeenCalledWith(COLLECTION)
    expect(find).toHaveBeenCalledWith(expect.any(Object))
    expect(project).toHaveBeenCalledWith({ _id: 1 })
    expect(sort).toHaveBeenCalledWith({ _id: 1 })
    expect(consoleInfo).toHaveBeenCalledWith(
      'normalise-pence-values migration affected records: count=2; ids=["affected","woodlands-wmp"]'
    )
    expect(updateMany).toHaveBeenCalledWith({ _id: { $in: ['affected', 'woodlands-wmp'] } }, expect.any(Array))
    expect(order).toEqual(['console.info', 'updateMany'])
  })

  test('normalises all known pence paths and preserves unrelated state', async () => {
    await db.collection(COLLECTION).insertOne({
      _id: 'affected',
      state: {
        totalPence: 1998.9999999999998,
        payment: {
          annualTotalPence: 1998.9999999999998,
          agreementTotalPence: 2998.9999999999995,
          parcelItems: {
            parcel1: {
              rateInPence: 28.999999999999996,
              annualPaymentPence: 56.99999999999999,
              label: 'parcel'
            }
          },
          agreementLevelItems: [
            {
              activeTierRatePence: 1998.9999999999998,
              activeTierFlatRatePence: 2998.9999999999995,
              agreementTotalPence: 499.00000000000006,
              label: 'first'
            },
            {
              activeTierRatePence: 2500,
              activeTierFlatRatePence: 0,
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
        annualTotalPence: 1999,
        agreementTotalPence: 2999,
        parcelItems: {
          parcel1: {
            rateInPence: 29,
            annualPaymentPence: 57,
            label: 'parcel'
          }
        },
        agreementLevelItems: [
          {
            activeTierRatePence: 1999,
            activeTierFlatRatePence: 2999,
            agreementTotalPence: 499,
            label: 'first'
          },
          {
            activeTierRatePence: 2500,
            activeTierFlatRatePence: 0,
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

  test('normalises current Woodlands object-keyed agreement level items', async () => {
    await db.collection(COLLECTION).insertOne({
      _id: 'woodlands-wmp',
      sbi: '300000001',
      grantCode: 'woodland',
      grantVersion: '1.0.0',
      state: {
        hectaresTenOrOverYearsOld: 50.5,
        totalPence: 1998.9999999999998,
        payment: {
          explanations: [],
          agreementStartDate: '2026-08-01',
          agreementEndDate: '2029-07-31',
          frequency: 'Single',
          agreementTotalPence: 1998.9999999999998,
          parcelItems: {},
          agreementLevelItems: {
            1: {
              code: 'PA3',
              description: 'Woodland management plan',
              version: '1.1.0',
              parcelIds: ['SD6351-8781', 'SD6352-8774', 'SD6252-7537'],
              activePaymentTier: 2,
              quantityInActiveTier: 0.5,
              activeTierRatePence: 28.999999999999996,
              activeTierFlatRatePence: 56.99999999999999,
              quantity: 50.5,
              agreementTotalPence: 1998.9999999999998,
              unit: 'ha'
            }
          },
          payments: [
            {
              totalPaymentPence: 1998.9999999999998,
              paymentDate: null,
              lineItems: [
                {
                  agreementLevelItemId: 1,
                  paymentPence: 1998.9999999999998
                }
              ]
            }
          ]
        }
      }
    })

    await up(db)

    const doc = await db.collection(COLLECTION).findOne({ _id: 'woodlands-wmp' })

    expect(doc.state.payment.agreementLevelItems).toEqual({
      1: {
        code: 'PA3',
        description: 'Woodland management plan',
        version: '1.1.0',
        parcelIds: ['SD6351-8781', 'SD6352-8774', 'SD6252-7537'],
        activePaymentTier: 2,
        quantityInActiveTier: 0.5,
        activeTierRatePence: 29,
        activeTierFlatRatePence: 57,
        quantity: 50.5,
        agreementTotalPence: 1999,
        unit: 'ha'
      }
    })
    expect(doc.state.payment.parcelItems).toEqual({})
    expect(doc.state.payment.payments).toEqual([
      {
        totalPaymentPence: 1999,
        paymentDate: null,
        lineItems: [
          {
            agreementLevelItemId: 1,
            paymentPence: 1999
          }
        ]
      }
    ])
  })
})
