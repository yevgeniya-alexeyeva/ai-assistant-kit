/**
 * @param {string} line
 * @returns {object | null}
 */
export function parseEventLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null

  const value = JSON.parse(trimmed)
  if (!value || typeof value !== 'object' || !['delta', 'done', 'error'].includes(value.type)) {
    throw new Error('Unknown stream event.')
  }
  return value
}

/**
 * @param {ReadableStream<Uint8Array>} stream
 */
export async function* readNdjson(stream) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        yield* eventFromLine(line)
      }
      if (done) break
    }

    yield* eventFromLine(buffer)
  } finally {
    reader.releaseLock()
  }
}

async function* eventFromLine(line) {
  if (!line.trim()) return
  try {
    const event = parseEventLine(line)
    if (event) yield event
  } catch {
    yield {
      type: 'error',
      message: 'The response stream could not be read.',
      code: 'stream_error',
    }
  }
}
