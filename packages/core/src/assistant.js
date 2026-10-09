import { AssistantError } from './errors.js'
import { createConversation, createMessage, normalizeConversation } from './messages.js'

/**
 * @param {object} options
 * @param {{ send: (request: object) => AsyncIterable<object> }} options.transport
 * @param {{ load?: () => Promise<unknown> | unknown, save?: (conversation: object) => Promise<void> | void, clear?: () => Promise<void> | void } | null} [options.storage]
 * @param {string} [options.systemPrompt]
 * @param {string} [options.id]
 * @param {() => Date} [options.now]
 * @param {() => string} [options.createId]
 */
export function createAssistant({
  transport,
  storage = null,
  systemPrompt = '',
  id,
  now = () => new Date(),
  createId,
} = {}) {
  if (typeof transport?.send !== 'function') {
    throw new AssistantError('An assistant transport is required.', 'missing_transport')
  }

  let conversation = createConversation({ id, now })
  let status = 'idle'
  let error = null
  let activeController = null
  let generation = 0
  let revision = 0
  const listeners = new Set()

  function snapshot() {
    return {
      conversation: structuredClone(conversation),
      status,
      error: error ? { ...error } : null,
    }
  }

  function emit() {
    const value = snapshot()
    for (const listener of listeners) listener(value)
  }

  function isCurrent(token) {
    return token === generation
  }

  async function persist(token) {
    if (!isCurrent(token) || typeof storage?.save !== 'function') return
    await storage.save(structuredClone(conversation))
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot: snapshot,

    async load() {
      if (typeof storage?.load !== 'function') return snapshot()
      const seen = revision

      try {
        const stored = await storage.load()
        if (seen !== revision) return snapshot()
        const normalized = normalizeConversation(stored, { now })
        if (!normalized) return snapshot()
        conversation = normalized
        status = 'idle'
        error = null
        emit()
      } catch {
        if (seen !== revision) return snapshot()
        error = {
          message: 'Saved conversation could not be read.',
          code: 'storage_error',
        }
        emit()
      }

      return snapshot()
    },

    cancel() {
      activeController?.abort()
    },

    async clear() {
      generation += 1
      revision += 1
      activeController?.abort()
      activeController = null
      conversation = createConversation({ id: conversation.id, now })
      status = 'idle'
      error = null
      emit()
      if (typeof storage?.clear === 'function') await storage.clear()
      return snapshot()
    },

    async *sendMessage(input, { signal } = {}) {
      const text = typeof input === 'string' ? input.trim() : ''
      if (!text) throw new AssistantError('Message cannot be empty.', 'empty_message')
      if (status === 'streaming') {
        throw new AssistantError('A response is already being generated.', 'busy')
      }

      revision += 1
      const token = generation
      const userMessage = createMessage({ role: 'user', content: text, now, createId })
      const assistantMessage = createMessage({
        role: 'assistant',
        content: '',
        status: 'streaming',
        now,
        createId,
      })

      conversation.messages.push(userMessage, assistantMessage)
      conversation.updatedAt = now().toISOString()
      status = 'streaming'
      error = null
      emit()
      await persist(token)
      if (!isCurrent(token)) return

      const controller = new AbortController()
      activeController = controller
      const abortFromCaller = () => controller.abort()
      signal?.addEventListener('abort', abortFromCaller, { once: true })

      const finishCancelled = async () => {
        if (!isCurrent(token)) return
        assistantMessage.status = 'cancelled'
        conversation.updatedAt = now().toISOString()
        status = 'idle'
        emit()
        await persist(token)
      }

      try {
        const history = conversation.messages.filter((message) => message !== assistantMessage)
        let accumulated = ''

        for await (const event of transport.send({
          messages: history.map((message) => structuredClone(message)),
          systemPrompt,
          messageId: assistantMessage.id,
          signal: controller.signal,
        })) {
          if (!isCurrent(token) || controller.signal.aborted) break
          if (!event || typeof event !== 'object') continue

          if (event.type === 'delta') {
            const delta = typeof event.text === 'string' ? event.text : ''
            if (!delta) continue
            accumulated += delta
            assistantMessage.content = accumulated
            conversation.updatedAt = now().toISOString()
            emit()
            yield { type: 'delta', messageId: assistantMessage.id, text: delta }
            continue
          }

          if (event.type === 'error') {
            assistantMessage.status = 'error'
            conversation.updatedAt = now().toISOString()
            status = 'error'
            error = {
              message: event.message || 'The assistant could not complete the response.',
              code: event.code || 'provider_error',
            }
            emit()
            await persist(token)
            yield {
              type: 'error',
              messageId: assistantMessage.id,
              message: error.message,
              code: error.code,
            }
            return
          }

          if (event.type === 'done') {
            if (typeof event.text === 'string' && event.text.length > 0) {
              accumulated = event.text
              assistantMessage.content = accumulated
            }
            assistantMessage.status = 'complete'
            conversation.updatedAt = now().toISOString()
            status = 'idle'
            emit()
            await persist(token)
            yield {
              type: 'done',
              messageId: assistantMessage.id,
              message: structuredClone(assistantMessage),
            }
            return
          }
        }

        if (!isCurrent(token)) return
        if (controller.signal.aborted) {
          await finishCancelled()
          return
        }

        assistantMessage.status = 'complete'
        assistantMessage.content = accumulated
        conversation.updatedAt = now().toISOString()
        status = 'idle'
        emit()
        await persist(token)
        yield {
          type: 'done',
          messageId: assistantMessage.id,
          message: structuredClone(assistantMessage),
        }
      } catch (caught) {
        if (!isCurrent(token)) return
        if (controller.signal.aborted || caught?.name === 'AbortError') {
          await finishCancelled()
          return
        }

        assistantMessage.status = 'error'
        conversation.updatedAt = now().toISOString()
        status = 'error'
        error = {
          message: caught?.message || 'The assistant could not complete the response.',
          code: caught?.code || 'transport_error',
        }
        emit()
        await persist(token)
        yield {
          type: 'error',
          messageId: assistantMessage.id,
          message: error.message,
          code: error.code,
        }
      } finally {
        signal?.removeEventListener('abort', abortFromCaller)
        if (activeController === controller) activeController = null
      }
    },
  }
}
