import assert from 'node:assert/strict'
import test from 'node:test'
import { createHttpTransport } from '@ai-assistant-kit/react'

function jsonResponse(body) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
}

async function collect(transport, request) {
  const events = []
  for await (const event of transport.send(request)) events.push(event)
  return events
}

test('posts the conversation and yields stream events', async () => {
  let request
  const transport = createHttpTransport({
    url: '/api/chat',
    fetchImpl: async (url, options) => {
      request = { url, options }
      return { ok: true, body: jsonResponse('{"type":"delta","text":"Hi"}\n{"type":"done","text":"Hi"}\n') }
    },
  })

  const events = await collect(transport, {
    messages: [{ id: '1', role: 'user', content: 'Hello' }],
    systemPrompt: 'Be brief.',
    messageId: '2',
  })

  assert.equal(request.url, '/api/chat')
  assert.deepEqual(JSON.parse(request.options.body), {
    messages: [{ id: '1', role: 'user', content: 'Hello' }],
    systemPrompt: 'Be brief.',
    messageId: '2',
  })
  assert.deepEqual(events.map((event) => event.type), ['delta', 'done'])
})

test('turns an unavailable server and an HTTP error into events', async () => {
  const unavailable = createHttpTransport({
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  const rejected = createHttpTransport({
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Некорректный запрос' }),
    }),
  })

  const offline = await collect(unavailable, { messages: [] })
  const invalid = await collect(rejected, { messages: [] })

  assert.equal(offline[0].code, 'unavailable')
  assert.equal(invalid[0].code, 'http_error')
  assert.equal(invalid[0].message, 'Некорректный запрос')
})

test('stops quietly when the caller aborts the request', async () => {
  const controller = new AbortController()
  controller.abort()
  const transport = createHttpTransport({
    fetchImpl: async () => {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    },
  })

  const events = await collect(transport, { messages: [], signal: controller.signal })
  assert.deepEqual(events, [])
})
