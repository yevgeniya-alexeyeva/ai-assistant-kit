import assert from 'node:assert/strict'
import test from 'node:test'
import { ValidationError, validateChatRequest } from '../src/validate.js'

test('accepts a conversation and removes unsupported fields', () => {
  const request = validateChatRequest({
    messages: [
      { id: 'a', role: 'assistant', content: 'Earlier', extra: true },
      { role: 'user', content: 'Hello' },
    ],
    systemPrompt: 'Be brief.',
    messageId: 'response-1',
  })

  assert.deepEqual(request, {
    messages: [
      { id: 'a', role: 'assistant', content: 'Earlier' },
      { id: undefined, role: 'user', content: 'Hello' },
    ],
    systemPrompt: 'Be brief.',
    messageId: 'response-1',
  })
})

test('rejects malformed conversations', () => {
  assert.throws(() => validateChatRequest(null), ValidationError)
  assert.throws(() => validateChatRequest({ messages: [] }), /хотя бы одно/)
  assert.throws(() => validateChatRequest({
    messages: [{ role: 'assistant', content: 'No question' }],
  }), /пользователя/)
  assert.throws(() => validateChatRequest({
    messages: [{ role: 'user', content: '   ' }],
  }), /не содержит текста/)
})
