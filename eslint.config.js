import neostandard from 'neostandard'

export default [
  { ignores: neostandard.resolveIgnoresFromGitignore() },
  ...neostandard({
    env: ['node', 'jest'],
    noJsx: true,
    noStyle: true
  })
]
