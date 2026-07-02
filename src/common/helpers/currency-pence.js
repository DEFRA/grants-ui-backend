const GBP_FORMATTER = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  useGrouping: false
})

/**
 * Recovers a GBP pence integer from a value that was originally produced by
 * multiplying a two-decimal pounds value by 100 with JavaScript floating point
 * arithmetic.
 *
 * @param {number} badPenceValue
 * @returns {{ pounds: string, pence: number }}
 */
export function recoverGbpPenceFromBadPenceValue(badPenceValue) {
  if (typeof badPenceValue !== 'number' || !Number.isFinite(badPenceValue)) {
    throw new TypeError('badPenceValue must be a finite number')
  }

  const poundsValue = badPenceValue / 100
  const parts = GBP_FORMATTER.formatToParts(poundsValue)
  const isNegative = parts.some((part) => part.type === 'minusSign')
  const integer = parts
    .filter((part) => part.type === 'integer')
    .map((part) => part.value)
    .join('')
  const fraction = parts.find((part) => part.type === 'fraction')?.value ?? ''
  const pounds = `${isNegative ? '-' : ''}${integer}.${fraction}`
  const pence = Number(integer) * 100 + Number(fraction)

  return {
    pounds,
    pence: isNegative ? -pence : pence
  }
}
