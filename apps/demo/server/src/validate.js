export class ValidationError extends Error {
  constructor(message, code = 'invalid_request') {
    super(message)
    this.name = 'ValidationError'
    this.code = code
  }
}

const ROLES = new Set(['system', 'user', 'assistant'])
const MAX_MESSAGES = 100
const MAX_CONTENT_LENGTH = 32_000
const MAX_SYSTEM_PROMPT_LENGTH = 8_000
const MAX_ID_LENGTH = 100

export function validateChatRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Тело запроса должно быть объектом.')
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new ValidationError('Нужно передать хотя бы одно сообщение.')
  }
  if (body.messages.length > MAX_MESSAGES) {
    throw new ValidationError('Слишком длинная история сообщений.')
  }

  const messages = body.messages.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new ValidationError(`Сообщение ${index + 1} имеет неверный формат.`)
    }
    if (!ROLES.has(message.role)) {
      throw new ValidationError(`Сообщение ${index + 1} содержит неизвестную роль.`)
    }
    if (typeof message.content !== 'string' || message.content.trim() === '') {
      throw new ValidationError(`Сообщение ${index + 1} не содержит текста.`)
    }
    if (message.content.length > MAX_CONTENT_LENGTH) {
      throw new ValidationError(`Сообщение ${index + 1} слишком длинное.`)
    }

    return {
      id: validId(message.id),
      role: message.role,
      content: message.content,
    }
  })

  if (messages.at(-1).role !== 'user') {
    throw new ValidationError('Последнее сообщение должно быть от пользователя.')
  }
  if (body.systemPrompt != null && typeof body.systemPrompt !== 'string') {
    throw new ValidationError('Системная инструкция должна быть строкой.')
  }
  if (typeof body.systemPrompt === 'string' && body.systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    throw new ValidationError('Системная инструкция слишком длинная.')
  }

  return {
    messages,
    systemPrompt: body.systemPrompt ?? '',
    messageId: validId(body.messageId),
  }
}

function validId(value) {
  return typeof value === 'string' && value.trim() && value.length <= MAX_ID_LENGTH
    ? value
    : undefined
}
