export function toGeminiContents(messages) {
  if (!Array.isArray(messages)) {
    throw new Error('Conversation history must be an array.')
  }

  const contents = []
  for (const message of messages) {
    if (message?.role !== 'user' && message?.role !== 'assistant') continue
    if (typeof message.content !== 'string' || message.content.trim() === '') continue

    const role = message.role === 'assistant' ? 'model' : 'user'
    const previous = contents.at(-1)
    if (previous?.role === role) {
      previous.parts[0].text += `\n\n${message.content}`
    } else {
      contents.push({ role, parts: [{ text: message.content }] })
    }
  }

  if (contents.length === 0 || contents[0].role !== 'user') {
    throw new Error('At least one user message is required.')
  }

  return contents
}
