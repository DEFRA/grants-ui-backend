/**
 * Tests for the read-only report migration that logs, but never writes, the
 * pence fields affected by upstream JavaScript floating point multiplication.
 */
import { up } from '~/migrations/state/20260702000001-report-pence-values.js'
import { COLLECTION } from '~/migrations/lib/pence-fields.js'
import { setupMigrationTestContext } from '../test-helpers/migration-test-context.js'

describe('report-pence-values migration', () => {
  const context = setupMigrationTestContext({
    dbName: 'report-pence-values-migration-test',
    collection: COLLECTION
  })

  test('logs the offending pence fields and writes nothing', async () => {
    const doc = {
      _id: 'affected',
      sbi: '300000001',
      grantCode: 'woodland',
      grantVersion: '1.0.0',
      status: 'started',
      state: {
        totalPence: 1998.9999999999998,
        payment: {
          payments: [
            {
              totalPaymentPence: 500,
              lineItems: [{ paymentPence: 1998.9999999999998, description: 'fee' }]
            }
          ]
        }
      }
    }
    await context.db.collection(COLLECTION).insertOne(doc)

    await up(context.db)

    expect(context.consoleInfo).toHaveBeenCalledWith(
      'report-pence-values (dry run): affectedRecords=1; totalProblemFields=2'
    )
    expect(context.consoleInfo).toHaveBeenCalledWith(
      expect.stringContaining(
        'id=affected; SBI=300000001; grantCode=woodland; grantVersion=1.0.0; status=started'
      )
    )
    expect(context.consoleInfo).toHaveBeenCalledWith(expect.stringContaining('"field":"totalPence"'))
    expect(context.consoleInfo).toHaveBeenCalledWith(
      expect.stringContaining('"field":"payment.payments.lineItems.paymentPence"')
    )

    const after = await context.db.collection(COLLECTION).findOne({ _id: 'affected' })
    expect(after).toEqual(doc)
  })
})
