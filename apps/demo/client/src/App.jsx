import { useEffect, useId, useRef, useState } from 'react'
import { createHttpTransport, createLocalStorage, useAssistant } from '@ai-assistant-kit/react'

const transport = createHttpTransport({ url: '/api/chat' })
const storage = createLocalStorage({ key: 'ai-assistant-kit.demo' })
const SYSTEM_PROMPT = 'Ты — внимательный ассистент. Отвечай на языке пользователя, ясно и по существу.'

const ERROR_TEXT = {
  empty_message: 'Введите сообщение.',
  busy: 'Дождитесь окончания текущего ответа.',
  rate_limit: 'Превышен лимит запросов Gemini. Попробуйте немного позже.',
  unauthorized: 'Gemini отклонил ключ API. Проверьте GEMINI_API_KEY на сервере.',
  provider_error: 'Gemini не смог сформировать ответ.',
  http_error: 'Сервер ассистента отклонил запрос.',
  unavailable: 'Сервер ассистента недоступен. Запустите его и попробуйте снова.',
  stream_error: 'Поток ответа прервался.',
  empty_stream: 'Сервер не прислал поток ответа.',
  invalid_request: 'Запрос не прошёл проверку.',
  server_error: 'На сервере произошла ошибка.',
  storage_error: 'Не удалось прочитать сохранённый диалог.',
  transport_error: 'Не удалось получить ответ.',
}

function describeError(error) {
  if (!error) return ''
  if (error.code === 'http_error' && error.message) return error.message
  return ERROR_TEXT[error.code] || error.message || 'Не удалось получить ответ.'
}

export default function App() {
  const { ready, messages, status, error, sendMessage, cancel, clear } = useAssistant({
    transport,
    storage,
    systemPrompt: SYSTEM_PROMPT,
  })
  const [draft, setDraft] = useState('')
  const [formError, setFormError] = useState(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const inputId = useId()
  const streaming = status === 'streaming'
  const visibleError = formError || error

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [messages, status, visibleError])

  async function handleSubmit(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || streaming || !ready) return

    setDraft('')
    setFormError(null)
    try {
      await sendMessage(text)
    } catch (caught) {
      setDraft(text)
      setFormError({
        message: caught instanceof Error ? caught.message : 'Не удалось отправить сообщение.',
        code: caught?.code,
      })
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  async function handleClear() {
    await clear()
    setFormError(null)
    inputRef.current?.focus()
  }

  function handleStop() {
    cancel()
    inputRef.current?.focus()
  }

  return (
    <main className="app">
      <section className="panel" aria-labelledby="assistant-title">
        <header className="header">
          <div>
            <p className="eyebrow">Универсальный модуль</p>
            <h1 id="assistant-title">AI-ассистент</h1>
          </div>
          <button className="ghost" type="button" onClick={handleClear} disabled={!ready || messages.length === 0}>
            Очистить
          </button>
        </header>

        <div className="transcript" ref={listRef} aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty">
              <h2>С чего начнём?</h2>
              <p>Задайте вопрос. Ответ появится здесь по мере генерации, а история сохранится в этом браузере.</p>
            </div>
          ) : (
            messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <span className="role">{message.role === 'user' ? 'Вы' : 'Ассистент'}</span>
                <MessageBody message={message} />
              </article>
            ))
          )}
        </div>

        {visibleError ? (
          <p className="banner" role="alert">{describeError(visibleError)}</p>
        ) : null}

        <form className="composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor={inputId}>Сообщение</label>
          <textarea
            id={inputId}
            ref={inputRef}
            rows="3"
            value={draft}
            placeholder={ready ? 'Напишите сообщение' : 'Загружаю историю…'}
            disabled={!ready}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="actions">
            <p className="hint">{streaming ? 'Ассистент отвечает' : 'Enter отправляет, Shift+Enter переносит строку'}</p>
            {streaming ? (
              <button className="stop" type="button" onClick={handleStop}>Остановить</button>
            ) : (
              <button className="send" type="submit" disabled={!ready || draft.trim() === ''}>Отправить</button>
            )}
          </div>
        </form>
      </section>
    </main>
  )
}

function MessageBody({ message }) {
  if (message.status === 'streaming' && message.content === '') {
    return <p className="typing" aria-label="Ассистент печатает"><span /><span /><span /></p>
  }
  if (message.status === 'cancelled' && message.content === '') {
    return <p className="note">Ответ остановлен.</p>
  }
  if (message.status === 'error' && message.content === '') {
    return <p className="note">Не удалось получить ответ.</p>
  }

  return (
    <>
      <p>{message.content}</p>
      {message.status === 'cancelled' ? <p className="note">Ответ остановлен.</p> : null}
    </>
  )
}
