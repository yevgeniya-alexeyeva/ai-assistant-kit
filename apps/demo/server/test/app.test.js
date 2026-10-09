import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApp } from '../src/app.js'

async function withServer(transport, run) {
  const app = createApp({ transport, corsOrigin: false })
  const server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()

  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

test('streams NDJSON without exposing the API key', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'test-key-should-not-leak'
  try {
    await withServer({
      async *send({ messageId, systemPrompt }) {
        assert.equal(messageId, 'response-1')
        assert.equal(systemPrompt, 'Be brief.')
        yield { type: 'delta', text: 'При' }
        yield { type: 'delta', text: 'вет' }
        yield { type: 'done', text: 'Привет' }
      },
    }, async (baseUrl) => {
      const health = await fetch(`${baseUrl}/api/health`)
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          systemPrompt: 'Be brief.',
          messageId: 'response-1',
        }),
      })
      const body = await response.text()

      assert.equal(health.status, 200)
      assert.equal(response.headers.get('content-type'), 'application/x-ndjson; charset=utf-8')
      assert.deepEqual(body.trim().split('\n').map((line) => JSON.parse(line)), [
        { type: 'delta', text: 'При', messageId: 'response-1' },
        { type: 'delta', text: 'вет', messageId: 'response-1' },
        { type: 'done', text: 'Привет', messageId: 'response-1' },
      ])
      assert.equal(body.includes('test-key-should-not-leak'), false)
      assert.equal(JSON.stringify(await health.json()).includes('test-key-should-not-leak'), false)
    })
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('returns validation errors before opening a stream', async () => {
  await withServer({
    async *send() {
      throw new Error('The transport should not be called.')
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.code, 'invalid_request')
  })
})

test('aborts the transport when the client disconnects', async () => {
  let observed
  await withServer({
    async *send({ signal }) {
      observed = signal
      yield { type: 'delta', text: 'partial' }
      await new Promise((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', () => resolve(), { once: true })
      })
    },
  }, async (baseUrl) => {
    const controller = new AbortController()
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      signal: controller.signal,
    })
    const reader = response.body.getReader()
    await reader.read()
    controller.abort()
    await reader.cancel().catch(() => {})
    await new Promise((resolve, reject) => {
      const started = Date.now()
      const timer = setInterval(() => {
        if (observed?.aborted) {
          clearInterval(timer)
          resolve()
        } else if (Date.now() - started > 1000) {
          clearInterval(timer)
          reject(new Error('Transport was not aborted.'))
        }
      }, 10)
    })
  })

  assert.equal(observed.aborted, true)
})
