import { recoverGbpPenceFromBadPenceValue } from './currency-pence.js'

describe('recoverGbpPenceFromBadPenceValue', () => {
  test('recovers 1998.9999999999998 to 19.99 pounds and 1999 pence', () => {
    expect(recoverGbpPenceFromBadPenceValue(1998.9999999999998)).toEqual({
      pounds: '19.99',
      pence: 1999
    })
  })

  test('recovers every two-decimal GBP value from 0.01 to 99.99 after value * 100', () => {
    for (let expectedPence = 1; expectedPence <= 9999; expectedPence += 1) {
      const originalPounds = Number((expectedPence / 100).toFixed(2))
      const badPenceValue = originalPounds * 100

      expect(recoverGbpPenceFromBadPenceValue(badPenceValue)).toEqual({
        pounds: (expectedPence / 100).toFixed(2),
        pence: expectedPence
      })
    }
  })
})
