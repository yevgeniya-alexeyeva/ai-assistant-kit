import { readNdjson } from './ndjson.js'

/**
 * @param {object} [options]
 * @param {string} [options.url]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createHttpTransport({
  url = '/api/chat',
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    async *send({ messages, systemPrompt = '', messageId, signal }) {
      let response
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson',
          },
          body: JSON.stringify({
            messages: messages.map(({ id, role, content }) => ({ id, role, content })),
            systemPrompt,
            messageId,
          }),
          signal,
        })
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') return
        yield {
          type: 'error',
          message: 'The assistant server is unavailable.',
          code: 'unavailable',
        }
        return
      }

      if (!response.ok) {
        yield {
          type: 'error',
          message: await readErrorMessage(response),
          code: 'http_error',
        }
        return
      }

      if (!response.body) {
        yield {
          type: 'error',
          message: 'The response did not include a stream.',
          code: 'empty_stream',
        }
        return
      }

      try {
        yield* readNdjson(response.body)
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') return
        yield {
          type: 'error',
          message: 'The response stream could not be read.',
          code: 'stream_error',
        }
      }
    },
  }
}

async function readErrorMessage(response) {
  try {
    const data = await response.json()
    if (typeof data?.error === 'string' && data.error.trim()) return data.error
  } catch {
    // The body is not JSON; the status below is enough for the interface.
  }
  return `Request failed with status ${response.status}.`
}
