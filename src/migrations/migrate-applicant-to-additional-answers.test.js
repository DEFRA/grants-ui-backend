import { migrateApplicantToAdditionalAnswers } from './migrate-applicant-to-additional-answers.js'

describe('migrateApplicantToAdditionalAnswers', () => {
  const mockUpdateMany = jest.fn()
  const mockCollection = jest.fn().mockReturnValue({ updateMany: mockUpdateMany })
  const mockDb = { collection: mockCollection }
  const mockLogger = { info: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('queries the grant-application-state collection', async () => {
    mockUpdateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 })

    await migrateApplicantToAdditionalAnswers(mockDb, mockLogger)

    expect(mockCollection).toHaveBeenCalledWith('grant-application-state')
  })

  test('runs updateMany with the correct filter and pipeline', async () => {
    mockUpdateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 })

    await migrateApplicantToAdditionalAnswers(mockDb, mockLogger)

    expect(mockUpdateMany).toHaveBeenCalledWith({ 'state.applicant': { $exists: true } }, [
      {
        $set: {
          'state.additionalAnswers': {
            $mergeObjects: [{ $ifNull: ['$state.additionalAnswers', {}] }, { applicant: '$state.applicant' }]
          }
        }
      },
      { $unset: 'state.applicant' }
    ])
  })

  test('logs completion with matchedCount and modifiedCount when records are migrated', async () => {
    mockUpdateMany.mockResolvedValue({ matchedCount: 3, modifiedCount: 3 })

    await migrateApplicantToAdditionalAnswers(mockDb, mockLogger)

    expect(mockLogger.info).toHaveBeenCalledWith(
      { matchedCount: 3, modifiedCount: 3 },
      'Migration: migrateApplicantToAdditionalAnswers complete'
    )
  })

  test('logs completion with zero counts when no records need migrating', async () => {
    mockUpdateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 })

    await migrateApplicantToAdditionalAnswers(mockDb, mockLogger)

    expect(mockLogger.info).toHaveBeenCalledWith(
      { matchedCount: 0, modifiedCount: 0 },
      'Migration: migrateApplicantToAdditionalAnswers complete'
    )
  })
})
