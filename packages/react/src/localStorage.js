/**
 * @param {object} [options]
 * @param {string} [options.key]
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} [options.storage]
 */
export function createLocalStorage({
  key = 'ai-assistant-kit',
  storage = globalThis.localStorage,
} = {}) {
  if (!storage) {
    throw new Error('localStorage is not available in this environment.')
  }

  return {
    load() {
      const raw = storage.getItem(key)
      if (!raw) return null
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    },
    save(conversation) {
      storage.setItem(key, JSON.stringify(conversation))
    },
    clear() {
      storage.removeItem(key)
    },
  }
}
