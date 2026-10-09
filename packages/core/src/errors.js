export class AssistantError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'assistant_error') {
    super(message)
    this.name = 'AssistantError'
    this.code = code
  }
}
