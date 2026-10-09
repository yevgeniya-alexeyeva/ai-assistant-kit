import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGeminiTransport } from '@ai-assistant-kit/gemini'
import { createApp } from './app.js'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(serverDirectory, '../../../../.env') })

let transport
try {
  transport = createGeminiTransport()
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Gemini transport could not be created.')
  process.exit(1)
}

const port = Number(process.env.PORT || 8787)
const app = createApp({
  transport,
  corsOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
})

app.listen(port, () => {
  console.log(`Assistant API listening on http://localhost:${port}`)
})
