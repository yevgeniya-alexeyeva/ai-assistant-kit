export function createMemoryStorage(initial = null) {
  let value = initial

  return {
    load() {
      return value ? structuredClone(value) : null
    },
    save(conversation) {
      value = structuredClone(conversation)
    },
    clear() {
      value = null
    },
  }
}
