import { health } from './health.js'

describe('#health', () => {
  describe('GET /health', () => {
    test('should return success message', async () => {
      const mockH = {
        response: jest.fn().mockReturnThis()
      }

      const result = health.handler({}, mockH)

      expect(mockH.response).toHaveBeenCalledWith({ message: 'success' })
      expect(result).toBe(mockH)
    })

    test('should have correct method and path', () => {
      expect(health.method).toBe('GET')
      expect(health.path).toBe('/health')
    })
  })
})
