import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GeminiConfigError,
  createGeminiTransport,
  redactSecrets,
  toGeminiContents,
  toPublicProviderError,
} from '@ai-assistant-kit/gemini'

test('requires an API key without revealing a supplied secret', () => {
  const previous = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY

  try {
    assert.throws(() => createGeminiTransport({ apiKey: '   ' }), GeminiConfigError)
    const secret = 'super-secret-value'
    assert.equal(new GeminiConfigError('GEMINI_API_KEY is not set.').message.includes(secret), false)
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previous
  }
})

test('maps conversation history to Gemini contents', () => {
  const contents = toGeminiContents([
    { role: 'system', content: 'Ignored here' },
    { role: 'user', content: 'First' },
    { role: 'user', content: 'Second' },
    { role: 'assistant', content: 'Reply' },
    { role: 'assistant', content: '   ' },
  ])

  assert.deepEqual(contents, [
    { role: 'user', parts: [{ text: 'First\n\nSecond' }] },
    { role: 'model', parts: [{ text: 'Reply' }] },
  ])
  assert.throws(() => toGeminiContents([{ role: 'assistant', content: 'Only a reply' }]), /user message/)
})

test('streams text from an injected client and stops when aborted', async () => {
  let seen
  const controller = new AbortController()
  const transport = createGeminiTransport({
    client: {
      models: {
        async generateContentStream(request) {
          seen = request
          return (async function* () {
            yield { text: 'Hel' }
            yield { text: '' }
            yield { text: 'lo' }
          })()
        },
      },
    },
  })

  const events = []
  for await (const event of transport.send({
    messages: [{ role: 'user', content: 'Hi' }],
    systemPrompt: 'Be brief.',
    signal: controller.signal,
  })) {
    events.push(event)
    if (events.length === 1) controller.abort()
  }

  assert.equal(seen.model, 'gemini-3.5-flash')
  assert.equal(seen.config.systemInstruction, 'Be brief.')
  assert.equal(seen.config.abortSignal, controller.signal)
  assert.deepEqual(events, [{ type: 'delta', text: 'Hel' }])
})

test('converts provider failures to public events and redacts secrets', async () => {
  const transport = createGeminiTransport({
    apiKey: 'AIzaSyShouldNotLeak123456',
    client: {
      models: {
        async generateContentStream() {
          const error = new Error('API key AIzaSyShouldNotLeak123456 was rejected')
          error.status = 403
          throw error
        },
      },
    },
  })

  const events = []
  for await (const event of transport.send({
    messages: [{ role: 'user', content: 'Hi' }],
  })) {
    events.push(event)
  }

  assert.equal(events[0].code, 'unauthorized')
  assert.equal(JSON.stringify(events).includes('AIzaSyShouldNotLeak123456'), false)
  assert.equal(redactSecrets('key AIzaSyShouldNotLeak123456'), 'key [redacted]')
  assert.equal(toPublicProviderError({ status: 429 }).code, 'rate_limit')
})
