export class GeminiConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GeminiConfigError'
    this.code = 'missing_api_key'
  }
}
