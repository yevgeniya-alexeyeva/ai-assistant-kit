import { GoogleGenAI } from '@google/genai'
import { toGeminiContents } from './contents.js'
import { GeminiConfigError } from './errors.js'
import { redactSecrets, toPublicProviderError } from './errorsPublic.js'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash'

/**
 * Server-side Gemini transport. The API key is read here and must never be
 * passed to browser code.
 *
 * @param {object} [options]
 * @param {string} [options.apiKey]
 * @param {string} [options.model]
 * @param {{ models: { generateContentStream: Function } }} [options.client]
 */
export function createGeminiTransport({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  client,
} = {}) {
  const resolvedKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!client && !resolvedKey) {
    throw new GeminiConfigError('GEMINI_API_KEY is not set. Add it to the server environment.')
  }
  if (!model || typeof model !== 'string') {
    throw new GeminiConfigError('GEMINI_MODEL must be a non-empty model name.')
  }

  const ai = client ?? new GoogleGenAI({ apiKey: resolvedKey })

  return {
    model,
    async *send({ messages, systemPrompt = '', signal }) {
      try {
        const response = await ai.models.generateContentStream({
          model,
          contents: toGeminiContents(messages),
          config: {
            ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
            abortSignal: signal,
          },
        })

        let full = ''
        for await (const chunk of response) {
          if (signal?.aborted) return
          const text = typeof chunk?.text === 'string' ? chunk.text : ''
          if (!text) continue
          full += text
          yield { type: 'delta', text }
        }

        if (signal?.aborted) return
        yield { type: 'done', text: full }
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') return
        console.error('Gemini request failed:', redactSecrets(error?.message || error))
        yield toPublicProviderError(error)
      }
    },
  }
}
