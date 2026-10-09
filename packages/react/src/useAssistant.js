import { useCallback, useEffect, useRef, useState } from 'react'
import { createAssistant } from '@ai-assistant-kit/core'

/**
 * Options are captured on the first render. Create the transport and storage
 * once outside the component or memoize them before passing them in.
 */
export function useAssistant(options) {
  const assistantRef = useRef(null)
  if (!assistantRef.current) {
    assistantRef.current = createAssistant(options)
  }

  const assistant = assistantRef.current
  const [, setVersion] = useState(0)
  const [ready, setReady] = useState(false)
  const rerender = useCallback(() => setVersion((version) => version + 1), [])

  useEffect(() => {
    let active = true
    const unsubscribe = assistant.subscribe(rerender)
    assistant.load().finally(() => {
      if (active) {
        setReady(true)
        rerender()
      }
    })

    return () => {
      active = false
      unsubscribe()
      assistant.cancel()
    }
  }, [assistant, rerender])

  const sendMessage = useCallback(async (text) => {
    for await (const event of assistant.sendMessage(text)) {
      void event
    }
  }, [assistant])

  const snapshot = assistant.getSnapshot()

  return {
    ready,
    messages: snapshot.conversation.messages,
    status: snapshot.status,
    error: snapshot.error,
    sendMessage,
    cancel: () => assistant.cancel(),
    clear: () => assistant.clear(),
  }
}
