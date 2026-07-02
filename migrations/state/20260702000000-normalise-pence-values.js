const COLLECTION = 'state__grant_application_state'

const emptyArrayWhenMissingOrNotArray = (value) => ({
  $cond: [{ $isArray: value }, value, []]
})

const needsNormalising = (value) => ({
  $and: [{ $isNumber: value }, { $ne: [value, { $round: [value, 0] }] }]
})

const roundedPence = (value) => ({
  $toLong: { $round: [value, 0] }
})

const normalisedFieldPatch = (field, value) => ({
  $cond: [needsNormalising(value), { [field]: roundedPence(value) }, {}]
})

const normaliseLineItem = (lineItem) => ({
  $cond: [
    { $eq: [{ $type: lineItem }, 'object'] },
    {
      $mergeObjects: [lineItem, normalisedFieldPatch('paymentPence', `${lineItem}.paymentPence`)]
    },
    lineItem
  ]
})

const normalisePayment = (payment) => ({
  $cond: [
    { $eq: [{ $type: payment }, 'object'] },
    {
      $mergeObjects: [
        payment,
        normalisedFieldPatch('totalPaymentPence', `${payment}.totalPaymentPence`),
        {
          $cond: [
            { $isArray: `${payment}.lineItems` },
            {
              lineItems: {
                $map: {
                  input: `${payment}.lineItems`,
                  as: 'lineItem',
                  in: normaliseLineItem('$$lineItem')
                }
              }
            },
            {}
          ]
        }
      ]
    },
    payment
  ]
})

const normaliseAgreementLevelItem = (item) => ({
  $cond: [
    { $eq: [{ $type: item }, 'object'] },
    {
      $mergeObjects: [
        item,
        normalisedFieldPatch('activeTierRatePence', `${item}.activeTierRatePence`),
        normalisedFieldPatch('agreementTotalPence', `${item}.agreementTotalPence`)
      ]
    },
    item
  ]
})

const anyNormalisableAgreementLevelItem = {
  $anyElementTrue: {
    $map: {
      input: emptyArrayWhenMissingOrNotArray('$state.payment.agreementLevelItems'),
      as: 'item',
      in: {
        $or: [needsNormalising('$$item.activeTierRatePence'), needsNormalising('$$item.agreementTotalPence')]
      }
    }
  }
}

const anyNormalisablePayment = {
  $anyElementTrue: {
    $map: {
      input: emptyArrayWhenMissingOrNotArray('$state.payment.payments'),
      as: 'payment',
      in: {
        $or: [
          needsNormalising('$$payment.totalPaymentPence'),
          {
            $anyElementTrue: {
              $map: {
                input: emptyArrayWhenMissingOrNotArray('$$payment.lineItems'),
                as: 'lineItem',
                in: needsNormalising('$$lineItem.paymentPence')
              }
            }
          }
        ]
      }
    }
  }
}

const filter = {
  $expr: {
    $or: [
      needsNormalising('$state.totalPence'),
      needsNormalising('$state.payment.agreementTotalPence'),
      anyNormalisableAgreementLevelItem,
      anyNormalisablePayment
    ]
  }
}

const update = [
  {
    $set: {
      state: {
        $mergeObjects: [
          '$state',
          normalisedFieldPatch('totalPence', '$state.totalPence'),
          {
            $cond: [
              { $eq: [{ $type: '$state.payment' }, 'object'] },
              {
                payment: {
                  $mergeObjects: [
                    '$state.payment',
                    normalisedFieldPatch('agreementTotalPence', '$state.payment.agreementTotalPence'),
                    {
                      $cond: [
                        { $isArray: '$state.payment.agreementLevelItems' },
                        {
                          agreementLevelItems: {
                            $map: {
                              input: '$state.payment.agreementLevelItems',
                              as: 'item',
                              in: normaliseAgreementLevelItem('$$item')
                            }
                          }
                        },
                        {}
                      ]
                    },
                    {
                      $cond: [
                        { $isArray: '$state.payment.payments' },
                        {
                          payments: {
                            $map: {
                              input: '$state.payment.payments',
                              as: 'payment',
                              in: normalisePayment('$$payment')
                            }
                          }
                        },
                        {}
                      ]
                    }
                  ]
                }
              },
              {}
            ]
          }
        ]
      }
    }
  }
]

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  await db.collection(COLLECTION).updateMany(filter, update)
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  // Intentionally not implemented: the original floating point values are not
  // useful once the pence values have been normalised.
}
