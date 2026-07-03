const COLLECTION = 'state__grant_application_state'

const emptyArrayWhenMissingOrNotArray = (value) => ({
  $cond: [{ $isArray: value }, value, []]
})

const objectValuesWhenStrictObject = (value) => ({
  $cond: [
    { $eq: [{ $type: value }, 'object'] },
    {
      $map: {
        input: { $objectToArray: value },
        as: 'entry',
        in: '$$entry.v'
      }
    },
    []
  ]
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

const normaliseParcelItem = (item) => ({
  $cond: [
    { $eq: [{ $type: item }, 'object'] },
    {
      $mergeObjects: [
        item,
        normalisedFieldPatch('rateInPence', `${item}.rateInPence`),
        normalisedFieldPatch('annualPaymentPence', `${item}.annualPaymentPence`)
      ]
    },
    item
  ]
})

const normaliseParcelItemsObject = (items) => ({
  $arrayToObject: {
    $map: {
      input: { $objectToArray: items },
      as: 'entry',
      in: {
        k: '$$entry.k',
        v: normaliseParcelItem('$$entry.v')
      }
    }
  }
})

const normaliseAgreementLevelItem = (item) => ({
  $cond: [
    { $eq: [{ $type: item }, 'object'] },
    {
      $mergeObjects: [
        item,
        normalisedFieldPatch('annualPaymentPence', `${item}.annualPaymentPence`),
        normalisedFieldPatch('activeTierRatePence', `${item}.activeTierRatePence`),
        normalisedFieldPatch('activeTierFlatRatePence', `${item}.activeTierFlatRatePence`),
        normalisedFieldPatch('agreementTotalPence', `${item}.agreementTotalPence`)
      ]
    },
    item
  ]
})

const normaliseAgreementLevelItemsObject = (items) => ({
  $arrayToObject: {
    $map: {
      input: { $objectToArray: items },
      as: 'entry',
      in: {
        k: '$$entry.k',
        v: normaliseAgreementLevelItem('$$entry.v')
      }
    }
  }
})

const parcelItemValues = {
  $concatArrays: [
    emptyArrayWhenMissingOrNotArray('$state.payment.parcelItems'),
    objectValuesWhenStrictObject('$state.payment.parcelItems')
  ]
}

const agreementLevelItemValues = {
  $concatArrays: [
    emptyArrayWhenMissingOrNotArray('$state.payment.agreementLevelItems'),
    objectValuesWhenStrictObject('$state.payment.agreementLevelItems')
  ]
}

const anyNormalisableParcelItem = {
  $anyElementTrue: {
    $map: {
      input: parcelItemValues,
      as: 'item',
      in: {
        $or: [needsNormalising('$$item.rateInPence'), needsNormalising('$$item.annualPaymentPence')]
      }
    }
  }
}

const anyNormalisableAgreementLevelItem = {
  $anyElementTrue: {
    $map: {
      input: agreementLevelItemValues,
      as: 'item',
      in: {
        $or: [
          needsNormalising('$$item.annualPaymentPence'),
          needsNormalising('$$item.activeTierRatePence'),
          needsNormalising('$$item.activeTierFlatRatePence'),
          needsNormalising('$$item.agreementTotalPence')
        ]
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
      needsNormalising('$state.payment.annualTotalPence'),
      anyNormalisableParcelItem,
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
                    normalisedFieldPatch('annualTotalPence', '$state.payment.annualTotalPence'),
                    {
                      $cond: [
                        { $isArray: '$state.payment.parcelItems' },
                        {
                          parcelItems: {
                            $map: {
                              input: '$state.payment.parcelItems',
                              as: 'item',
                              in: normaliseParcelItem('$$item')
                            }
                          }
                        },
                        {
                          $cond: [
                            { $eq: [{ $type: '$state.payment.parcelItems' }, 'object'] },
                            {
                              parcelItems: normaliseParcelItemsObject('$state.payment.parcelItems')
                            },
                            {}
                          ]
                        }
                      ]
                    },
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
                        {
                          $cond: [
                            { $eq: [{ $type: '$state.payment.agreementLevelItems' }, 'object'] },
                            {
                              agreementLevelItems: normaliseAgreementLevelItemsObject(
                                '$state.payment.agreementLevelItems'
                              )
                            },
                            {}
                          ]
                        }
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

const stringifyRecordId = (id) => {
  if (id && typeof id.toHexString === 'function') {
    return id.toHexString()
  }

  return String(id)
}

const logAffectedRecords = (affectedIds) => {
  console.info(
    `normalise-pence-values migration affected records: count=${affectedIds.length}; ids=${JSON.stringify(
      affectedIds.map(stringifyRecordId)
    )}`
  )
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  const collection = db.collection(COLLECTION)
  const affectedRecords = await collection.find(filter).project({ _id: 1 }).sort({ _id: 1 }).toArray()
  const affectedIds = affectedRecords.map(({ _id }) => _id)

  logAffectedRecords(affectedIds)

  if (affectedIds.length === 0) {
    return
  }

  await collection.updateMany({ _id: { $in: affectedIds } }, update)
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  // Intentionally not implemented: the original floating point values are not
  // useful once the pence values have been normalised.
}
