import { AssistantError } from './errors.js'

const ROLES = new Set(['system', 'user', 'assistant'])
const STATUSES = new Set(['complete', 'streaming', 'error', 'cancelled'])

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {object} options
 * @param {'system' | 'user' | 'assistant'} options.role
 * @param {string} options.content
 * @param {string} [options.id]
 * @param {string} [options.createdAt]
 * @param {'complete' | 'streaming' | 'error' | 'cancelled'} [options.status]
 * @param {() => Date} [options.now]
 * @param {() => string} [options.createId]
 */
export function createMessage({
  role,
  content,
  id,
  createdAt,
  status = 'complete',
  now = () => new Date(),
  createId: makeId = createId,
}) {
  if (!ROLES.has(role)) {
    throw new AssistantError(`Unsupported message role: ${role}.`, 'invalid_message')
  }
  if (typeof content !== 'string') {
    throw new AssistantError('Message content must be a string.', 'invalid_message')
  }
  if (!STATUSES.has(status)) {
    throw new AssistantError(`Unsupported message status: ${status}.`, 'invalid_message')
  }

  return {
    id: id || makeId(),
    role,
    content,
    createdAt: createdAt || now().toISOString(),
    status,
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.id]
 * @param {Array<ReturnType<typeof createMessage>>} [options.messages]
 * @param {string} [options.updatedAt]
 * @param {() => Date} [options.now]
 */
export function createConversation({
  id,
  messages = [],
  updatedAt,
  now = () => new Date(),
} = {}) {
  return {
    id: id || createId(),
    messages,
    updatedAt: updatedAt || now().toISOString(),
  }
}

/**
 * Restores a saved conversation and closes any response that was interrupted.
 * @param {unknown} value
 * @param {{ now?: () => Date }} [options]
 */
export function normalizeConversation(value, options = {}) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.messages)) return null

  const now = options.now ?? (() => new Date())
  const source = /** @type {{ id?: unknown, updatedAt?: unknown, messages: unknown[] }} */ (value)
  const messages = []

  for (const item of source.messages) {
    if (!item || typeof item !== 'object') continue
    const candidate = /** @type {{ role?: unknown, content?: unknown, id?: unknown, createdAt?: unknown, status?: unknown }} */ (item)
    if (typeof candidate.content !== 'string' || !ROLES.has(/** @type {'system' | 'user' | 'assistant'} */ (candidate.role))) continue

    const status = candidate.status === 'streaming' ? 'cancelled' : candidate.status
    messages.push(createMessage({
      id: typeof candidate.id === 'string' ? candidate.id : undefined,
      role: /** @type {'system' | 'user' | 'assistant'} */ (candidate.role),
      content: candidate.content,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
      status: STATUSES.has(/** @type {'complete'} */ (status)) ? /** @type {'complete' | 'streaming' | 'error' | 'cancelled'} */ (status) : 'complete',
      now,
    }))
  }

  return createConversation({
    id: typeof source.id === 'string' ? source.id : undefined,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : undefined,
    messages,
    now,
  })
}
