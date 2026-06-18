import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { load as loadYaml } from 'js-yaml'
import { config } from '../../config.js'
import { getS3Client, getYamlObject, _resetS3ClientForTests } from './s3.js'

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  GetObjectCommand: jest.fn((input) => ({ input }))
}))

jest.mock('js-yaml', () => ({
  load: jest.fn()
}))

jest.mock('../../config.js', () => ({
  config: {
    get: jest.fn()
  }
}))

const configValues = {
  'aws.region': 'eu-west-2',
  'aws.endpointUrl': undefined
}

describe('s3', () => {
  beforeEach(() => {
    _resetS3ClientForTests()
    config.get.mockImplementation((key) => configValues[key])
  })

  afterEach(() => {
    configValues['aws.endpointUrl'] = undefined
  })

  describe('getS3Client', () => {
    test('creates a client configured with the region', () => {
      getS3Client()

      expect(S3Client).toHaveBeenCalledWith({ region: 'eu-west-2' })
    })

    test('adds endpoint and forcePathStyle when an endpoint URL is configured', () => {
      configValues['aws.endpointUrl'] = 'http://localhost:4566'

      getS3Client()

      expect(S3Client).toHaveBeenCalledWith({
        region: 'eu-west-2',
        endpoint: 'http://localhost:4566',
        forcePathStyle: true
      })
    })

    test('caches the client across calls', () => {
      const first = getS3Client()
      const second = getS3Client()

      expect(first).toBe(second)
      expect(S3Client).toHaveBeenCalledTimes(1)
    })

    test('creates a fresh client after _resetS3ClientForTests', () => {
      getS3Client()
      _resetS3ClientForTests()
      getS3Client()

      expect(S3Client).toHaveBeenCalledTimes(2)
    })
  })

  describe('getYamlObject', () => {
    test('fetches the object and parses its body as YAML', async () => {
      const send = jest.fn().mockResolvedValue({
        Body: { transformToString: jest.fn().mockResolvedValue('name: Farm Payments') }
      })
      S3Client.mockImplementation(() => ({ send }))
      loadYaml.mockReturnValue({ name: 'Farm Payments' })

      const result = await getYamlObject('my-bucket', 'farm-payments.yaml')

      expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'my-bucket', Key: 'farm-payments.yaml' })
      expect(send).toHaveBeenCalledWith({ input: { Bucket: 'my-bucket', Key: 'farm-payments.yaml' } })
      expect(loadYaml).toHaveBeenCalledWith('name: Farm Payments')
      expect(result).toEqual({ name: 'Farm Payments' })
    })

    test('propagates errors from the S3 client', async () => {
      const send = jest.fn().mockRejectedValue(new Error('access denied'))
      S3Client.mockImplementation(() => ({ send }))

      await expect(getYamlObject('my-bucket', 'missing.yaml')).rejects.toThrow('access denied')
    })
  })
})
