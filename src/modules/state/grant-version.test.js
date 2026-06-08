import { normaliseGrantVersion } from './grant-version.js'

describe('normaliseGrantVersion', () => {
  test('keeps a valid semver string and decomposes its parts', () => {
    expect(normaliseGrantVersion('4.5.6')).toEqual({
      grantVersion: '4.5.6',
      pinnedMajor: 4,
      major: 4,
      minor: 5,
      patch: 6
    })
  })

  test('coerces the legacy integer 1 to 1.0.0', () => {
    expect(normaliseGrantVersion(1)).toEqual({
      grantVersion: '1.0.0',
      pinnedMajor: 1,
      major: 1,
      minor: 0,
      patch: 0
    })
  })

  test('coerces a bare major string to semver', () => {
    expect(normaliseGrantVersion('2')).toEqual({
      grantVersion: '2.0.0',
      pinnedMajor: 2,
      major: 2,
      minor: 0,
      patch: 0
    })
  })

  test('falls back to 1.0.0 for unparseable values', () => {
    expect(normaliseGrantVersion(undefined)).toEqual({
      grantVersion: '1.0.0',
      pinnedMajor: 1,
      major: 1,
      minor: 0,
      patch: 0
    })
    expect(normaliseGrantVersion('not-a-version')).toEqual({
      grantVersion: '1.0.0',
      pinnedMajor: 1,
      major: 1,
      minor: 0,
      patch: 0
    })
    expect(normaliseGrantVersion(-1)).toEqual({
      grantVersion: '1.0.0',
      pinnedMajor: 1,
      major: 1,
      minor: 0,
      patch: 0
    })
  })
})
