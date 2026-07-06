import { parsePurgeConfig } from './version'

describe('parsePurgeConfig', () => {
  test('returns empty array for empty value', () => {
    expect(parsePurgeConfig('')).toEqual([])
    expect(parsePurgeConfig('   ')).toEqual([])
    expect(parsePurgeConfig(undefined)).toEqual([])
  })

  test('parses a single rule', () => {
    expect(parsePurgeConfig('woodland:<2.0.0')).toEqual([
      {
        grantCode: 'woodland',
        rule: '<2.0.0'
      }
    ])
  })

  test('parses multiple rules separated by semicolons', () => {
    expect(parsePurgeConfig('woodland:<2.0.0;sfi:1.0.0')).toEqual([
      {
        grantCode: 'woodland',
        rule: '<2.0.0'
      },
      {
        grantCode: 'sfi',
        rule: '1.0.0'
      }
    ])
  })

  test('trims whitespace', () => {
    expect(parsePurgeConfig(' woodland : <2.0.0 ; sfi : 1.0.0 ')).toEqual([
      {
        grantCode: 'woodland',
        rule: '<2.0.0'
      },
      {
        grantCode: 'sfi',
        rule: '1.0.0'
      }
    ])
  })

  test('supports complex semver ranges', () => {
    expect(parsePurgeConfig('woodland:>=2.0.0 <3.0.0')).toEqual([
      {
        grantCode: 'woodland',
        rule: '>=2.0.0 <3.0.0'
      }
    ])
  })

  test('throws when colon is missing', () => {
    expect(() => parsePurgeConfig('woodland')).toThrow("Invalid purge rule 'woodland'")
  })
})
