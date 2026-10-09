import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function readSource(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(directory, name), 'utf8'))
    .join('\n')
}

test('core has no interface, provider, or browser dependencies', () => {
  const source = readSource('packages/core/src')
  assert.doesNotMatch(source, /react|@google\/genai|localStorage|window|document|fetch\(/i)
})

test('the React adapter does not import the Gemini SDK', () => {
  const source = readSource('packages/react/src')
  assert.doesNotMatch(source, /@google\/genai|GoogleGenAI/)
})

test('the Gemini adapter does not import React', () => {
  const source = readSource('packages/gemini/src')
  assert.doesNotMatch(source, /from ['"]react['"]|react-dom/)
})
