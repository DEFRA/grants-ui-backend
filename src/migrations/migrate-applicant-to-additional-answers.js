/**
 * TGC-1204: Previous to v1.208.0 `state.applicant` was stored at the top level of `state` instead of
 * nested under `state.additionalAnswers.applicant`. This migration moves existing documents to
 * the new, v1.208.0+ structure. See https://eaflood.atlassian.net/browse/TGC-1204
 */
export async function migrateApplicantToAdditionalAnswers(db, logger) {
  const collection = db.collection('grant-application-state')

  const result = await collection.updateMany({ 'state.applicant': { $exists: true } }, [
    {
      $set: {
        'state.additionalAnswers': {
          $mergeObjects: [{ $ifNull: ['$state.additionalAnswers', {}] }, { applicant: '$state.applicant' }]
        }
      }
    },
    { $unset: 'state.applicant' }
  ])

  logger.info(
    { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount },
    'Migration: migrateApplicantToAdditionalAnswers complete'
  )
}
