import { parseSnsMessage } from './sns-message.js'

describe('parseSnsMessage', () => {
  describe('default SNS delivery (notification envelope)', () => {
    test('extracts attributes and parses the JSON manifest', () => {
      const body = JSON.stringify({
        Type: 'Notification',
        MessageAttributes: {
          grant: { Type: 'String', Value: 'farm-payments' },
          version: { Type: 'String', Value: '1.0.0' }
        },
        Message: JSON.stringify(['farm-payments.yaml', 'extra.yaml'])
      })

      const result = parseSnsMessage(body)

      expect(result).toEqual({
        attributes: { grant: 'farm-payments', version: '1.0.0' },
        manifest: ['farm-payments.yaml', 'extra.yaml']
      })
    })

    test('falls back to StringValue when Value is absent', () => {
      const body = JSON.stringify({
        Type: 'Notification',
        MessageAttributes: {
          grant: { StringValue: 'farm-payments' }
        },
        Message: '[]'
      })

      const result = parseSnsMessage(body)

      expect(result.attributes).toEqual({ grant: 'farm-payments' })
    })

    test('defaults a missing attribute value to an empty string', () => {
      const body = JSON.stringify({
        Type: 'Notification',
        MessageAttributes: {
          grant: { Type: 'String' }
        },
        Message: '[]'
      })

      const result = parseSnsMessage(body)

      expect(result.attributes).toEqual({ grant: '' })
    })

    test('returns the raw Message string when it is not valid JSON', () => {
      const body = JSON.stringify({
        Type: 'Notification',
        MessageAttributes: {},
        Message: 'not-json'
      })

      const result = parseSnsMessage(body)

      expect(result.manifest).toBe('not-json')
    })

    test('treats a missing MessageAttributes object as no attributes', () => {
      const body = JSON.stringify({
        Type: 'Notification',
        Message: '[]'
      })

      const result = parseSnsMessage(body)

      expect(result.attributes).toEqual({})
    })
  })

  describe('raw message delivery', () => {
    test('uses the body as the manifest and reads attributes from SQS', () => {
      const body = JSON.stringify(['farm-payments.yaml'])
      const sqsAttributes = {
        grant: { StringValue: 'farm-payments' },
        version: { stringValue: '2.0.0' }
      }

      const result = parseSnsMessage(body, sqsAttributes)

      expect(result).toEqual({
        attributes: { grant: 'farm-payments', version: '2.0.0' },
        manifest: ['farm-payments.yaml']
      })
    })

    test('defaults missing SQS attribute values to an empty string', () => {
      const body = JSON.stringify([])
      const sqsAttributes = { grant: {} }

      const result = parseSnsMessage(body, sqsAttributes)

      expect(result.attributes).toEqual({ grant: '' })
    })

    test('returns empty attributes when no SQS attributes are provided', () => {
      const result = parseSnsMessage(JSON.stringify([]))

      expect(result.attributes).toEqual({})
    })
  })

  test('throws a descriptive error when the body is not valid JSON', () => {
    expect(() => parseSnsMessage('{ not json')).toThrow(/SQS message body is not valid JSON/)
  })
})
