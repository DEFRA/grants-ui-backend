import { resolveLatestVersion, resolveLatestVersionWithinMajor, getDefinition } from './config.service.js'
import {
  resolveLatestVersion as repoResolveLatestVersion,
  resolveLatestVersionWithinMajor as repoResolveLatestVersionWithinMajor,
  getDefinition as repoGetDefinition
} from './config.repository.js'

jest.mock('./config.repository.js', () => ({
  resolveLatestVersion: jest.fn(),
  resolveLatestVersionWithinMajor: jest.fn(),
  getDefinition: jest.fn()
}))

describe('config.service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('resolveLatestVersion', () => {
    test('delegates to the repository with grantCode', () => {
      const expected = { major: 2, minor: 0, patch: 0 }
      repoResolveLatestVersion.mockResolvedValue(expected)

      const result = resolveLatestVersion('farm-payments')

      expect(repoResolveLatestVersion).toHaveBeenCalledWith('farm-payments')
      return expect(result).resolves.toBe(expected)
    })

    test('returns null when repository returns null', () => {
      repoResolveLatestVersion.mockResolvedValue(null)

      return expect(resolveLatestVersion('unknown-grant')).resolves.toBeNull()
    })
  })

  describe('resolveLatestVersionWithinMajor', () => {
    test('delegates to the repository with grantCode and pinnedMajor', () => {
      const expected = { major: 1, minor: 3, patch: 0 }
      repoResolveLatestVersionWithinMajor.mockResolvedValue(expected)

      const result = resolveLatestVersionWithinMajor('farm-payments', 1)

      expect(repoResolveLatestVersionWithinMajor).toHaveBeenCalledWith('farm-payments', 1)
      return expect(result).resolves.toBe(expected)
    })

    test('returns null when no live version exists within the pinned major', () => {
      repoResolveLatestVersionWithinMajor.mockResolvedValue(null)

      return expect(resolveLatestVersionWithinMajor('farm-payments', 99)).resolves.toBeNull()
    })
  })

  describe('getDefinition', () => {
    test('delegates to the repository with grantCode and semver parts', () => {
      const expected = { major: 1, minor: 2, patch: 3 }
      repoGetDefinition.mockResolvedValue(expected)

      const result = getDefinition('farm-payments', 1, 2, 3)

      expect(repoGetDefinition).toHaveBeenCalledWith('farm-payments', 1, 2, 3)
      return expect(result).resolves.toBe(expected)
    })

    test('returns null when the exact version does not exist', () => {
      repoGetDefinition.mockResolvedValue(null)

      return expect(getDefinition('farm-payments', 9, 9, 9)).resolves.toBeNull()
    })
  })
})
