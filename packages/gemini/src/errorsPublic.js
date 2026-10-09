export function toPublicProviderError(error) {
  const status = Number(error?.status || error?.code)
  const raw = `${error?.message ?? ''} ${error?.status ?? ''}`

  if (status === 429 || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      message: 'Gemini rate limit was reached. Try again later.',
      code: 'rate_limit',
    }
  }

  if (status === 401 || status === 403 || /API key|permission|unauth/i.test(raw)) {
    return {
      message: 'Gemini rejected the API key.',
      code: 'unauthorized',
    }
  }

  return {
    message: 'Gemini could not generate a response.',
    code: 'provider_error',
  }
}

export function redactSecrets(value) {
  return String(value ?? '').replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted]')
}
