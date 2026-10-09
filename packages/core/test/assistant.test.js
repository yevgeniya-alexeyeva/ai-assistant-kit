import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AssistantError,
  createAssistant,
  createMemoryStorage,
} from '@ai-assistant-kit/core'

async function collect(iterable) {
  const events = []
  for await (const event of iterable) events.push(event)
  return events
}

function scriptedTransport(events, capture) {
  return {
    async *send(request) {
      if (capture) capture.request = request
      for (const event of events) yield event
    },
  }
}

test('streams a response and stores the finished conversation', async () => {
  const storage = createMemoryStorage()
  const capture = {}
  const assistant = createAssistant({
    transport: scriptedTransport([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'done', text: 'Hello' },
    ], capture),
    storage,
    systemPrompt: 'Be brief.',
  })

  const events = await collect(assistant.sendMessage('  Hi  '))
  const snapshot = assistant.getSnapshot()
  const saved = await storage.load()

  assert.deepEqual(events.map((event) => event.type), ['delta', 'delta', 'done'])
  assert.equal(snapshot.status, 'idle')
  assert.equal(snapshot.conversation.messages[0].content, 'Hi')
  assert.equal(snapshot.conversation.messages[1].content, 'Hello')
  assert.equal(snapshot.conversation.messages[1].status, 'complete')
  assert.equal(capture.request.systemPrompt, 'Be brief.')
  assert.equal(capture.request.messages.some((message) => message.status === 'streaming'), false)
  assert.equal(saved.messages.length, 2)
})

test('keeps accumulated text when the provider omits the final text', async () => {
  const assistant = createAssistant({
    transport: scriptedTransport([
      { type: 'delta', text: 'One' },
      { type: 'delta', text: ' two' },
      { type: 'done' },
    ]),
  })

  await collect(assistant.sendMessage('Continue'))
  assert.equal(assistant.getSnapshot().conversation.messages.at(-1).content, 'One two')
})

test('marks a provider failure without dropping the partial answer', async () => {
  const assistant = createAssistant({
    transport: scriptedTransport([
      { type: 'delta', text: 'Partial' },
      { type: 'error', message: 'Provider failed.', code: 'provider_error' },
    ]),
  })

  const events = await collect(assistant.sendMessage('Hello'))
  const snapshot = assistant.getSnapshot()

  assert.equal(events.at(-1).type, 'error')
  assert.equal(snapshot.status, 'error')
  assert.equal(snapshot.error.code, 'provider_error')
  assert.equal(snapshot.conversation.messages.at(-1).content, 'Partial')
  assert.equal(snapshot.conversation.messages.at(-1).status, 'error')
})

test('marks the response cancelled and lets clear win over a late save', async () => {
  let release
  const started = new Promise((resolve) => {
    release = resolve
  })
  const assistant = createAssistant({
    storage: createMemoryStorage(),
    transport: {
      async *send({ signal }) {
        release()
        await new Promise((_resolve, reject) => {
          const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
          if (signal.aborted) abort()
          else signal.addEventListener('abort', abort, { once: true })
        })
      },
    },
  })

  const pending = collect(assistant.sendMessage('Hello'))
  await started
  assistant.cancel()
  await pending

  const cancelled = assistant.getSnapshot().conversation.messages.at(-1)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(assistant.getSnapshot().status, 'idle')

  await assistant.clear()
  assert.deepEqual(assistant.getSnapshot().conversation.messages, [])
})

test('converts an unexpected transport failure into an error event', async () => {
  const assistant = createAssistant({
    transport: {
      async *send() {
        throw Object.assign(new Error('Socket closed.'), { code: 'socket_closed' })
      },
    },
  })

  const events = await collect(assistant.sendMessage('Hi'))
  assert.equal(events[0].code, 'socket_closed')
  assert.equal(assistant.getSnapshot().status, 'error')
  assert.equal(assistant.getSnapshot().conversation.messages.at(-1).status, 'error')
})

test('requires a transport', () => {
  assert.throws(() => createAssistant(), (error) => {
    assert.ok(error instanceof AssistantError)
    assert.equal(error.code, 'missing_transport')
    return true
  })
})

test('rejects an empty message and a second message while streaming', async () => {
  let release
  const started = new Promise((resolve) => {
    release = resolve
  })
  const assistant = createAssistant({
    transport: {
      async *send({ signal }) {
        release()
        await new Promise((resolve) => {
          if (signal.aborted) resolve()
          else signal.addEventListener('abort', () => resolve(), { once: true })
        })
      },
    },
  })

  await assert.rejects(collect(assistant.sendMessage('   ')), (error) => {
    assert.ok(error instanceof AssistantError)
    assert.equal(error.code, 'empty_message')
    return true
  })

  const pending = collect(assistant.sendMessage('Hello'))
  await started
  await assert.rejects(collect(assistant.sendMessage('Again')), (error) => {
    assert.equal(error.code, 'busy')
    return true
  })
  assistant.cancel()
  await pending
})

test('restores history and closes a response interrupted on the previous visit', async () => {
  const storage = createMemoryStorage({
    id: 'saved',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [
      { id: 'user-1', role: 'user', content: 'Hi', createdAt: '2026-01-01T00:00:00.000Z', status: 'complete' },
      { id: 'assistant-1', role: 'assistant', content: 'Part', createdAt: '2026-01-01T00:00:01.000Z', status: 'streaming' },
    ],
  })
  const assistant = createAssistant({
    transport: scriptedTransport([]),
    storage,
  })

  await assistant.load()
  const messages = assistant.getSnapshot().conversation.messages
  assert.equal(messages[1].status, 'cancelled')
  assert.equal(messages[1].content, 'Part')
})
