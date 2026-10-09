import assert from 'node:assert/strict'
import test from 'node:test'
import { parseEventLine, readNdjson } from '@ai-assistant-kit/react'

function streamFrom(chunks) {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

test('parses the supported stream events', () => {
  assert.equal(parseEventLine('   '), null)
  assert.equal(parseEventLine('{"type":"delta","text":"Hi"}').text, 'Hi')
  assert.throws(() => parseEventLine('{"type":"unknown"}'), /Unknown stream event/)
})

test('reads events split across chunks and reports malformed JSON', async () => {
  const events = []
  for await (const event of readNdjson(streamFrom([
    '{"type":"delta","text":"Hel',
    'lo"}\nnot-json\n{"type":"done","text":"Hello"}\n',
  ]))) {
    events.push(event)
  }

  assert.deepEqual(events.map((event) => event.type), ['delta', 'error', 'done'])
  assert.equal(events[0].text, 'Hello')
  assert.equal(events[1].code, 'stream_error')
})
