import cors from 'cors'
import express from 'express'
import { ValidationError, validateChatRequest } from './validate.js'

const PUBLIC_SERVER_ERROR = {
  type: 'error',
  message: 'Не удалось завершить ответ.',
  code: 'server_error',
}

/**
 * @param {object} options
 * @param {{ send: (request: object) => AsyncIterable<object> }} options.transport
 * @param {string | false} [options.corsOrigin]
 */
export function createApp({ transport, corsOrigin = 'http://localhost:5173' } = {}) {
  if (typeof transport?.send !== 'function') {
    throw new Error('A chat transport is required.')
  }

  const app = express()
  if (corsOrigin) app.use(cors({ origin: corsOrigin }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.post('/api/chat', async (request, response) => {
    let chatRequest
    try {
      chatRequest = validateChatRequest(request.body)
    } catch (error) {
      const status = error instanceof ValidationError ? 400 : 500
      response.status(status).json({
        error: error instanceof ValidationError ? error.message : PUBLIC_SERVER_ERROR.message,
        code: error instanceof ValidationError ? error.code : PUBLIC_SERVER_ERROR.code,
      })
      return
    }

    const controller = new AbortController()
    const abort = () => controller.abort()
    request.on('aborted', abort)
    response.on('close', () => {
      if (!response.writableEnded) abort()
    })

    response.status(200)
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache, no-transform')
    response.setHeader('X-Accel-Buffering', 'no')
    response.flushHeaders?.()

    try {
      for await (const event of transport.send({
        messages: chatRequest.messages,
        systemPrompt: chatRequest.systemPrompt,
        messageId: chatRequest.messageId,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted || response.writableEnded) break
        writeEvent(response, event, chatRequest.messageId)
      }
    } catch (error) {
      if (!controller.signal.aborted && !response.writableEnded) {
        console.error('Chat stream failed:', error instanceof Error ? error.message : 'Unknown error')
        writeEvent(response, PUBLIC_SERVER_ERROR, chatRequest.messageId)
      }
    } finally {
      if (!response.writableEnded) response.end()
    }
  })

  app.use((error, _request, response, next) => {
    if (error?.type === 'entity.parse.failed') {
      response.status(400).json({
        error: 'Тело запроса должно быть корректным JSON.',
        code: 'invalid_json',
      })
      return
    }
    next(error)
  })

  return app
}

function writeEvent(response, event, messageId) {
  const payload = messageId && event && typeof event === 'object' && !event.messageId
    ? { ...event, messageId }
    : event
  response.write(`${JSON.stringify(payload)}\n`)
}
