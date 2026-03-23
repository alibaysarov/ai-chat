# Feature: Chat Streaming

## Контекст
Реализация потоковой передачи ответов от AI-модели через WebSocket, чтобы пользователь видел ответ по мере генерации. Ответ также сохраняется в БД, и при следующем входе пользователь увидит полный текст.

## Провайдер и модель

| Параметр | Значение |
|---|---|
| Провайдер | **OpenAI** (SDK `openai`, синглтон в `apps/server/src/lib/ai-client.ts`) |
| Модель | **`gpt-4o-mini`** — быстрая, дешёвая ($0.15/1M input, $0.60/1M output), 128 000 контекст, поддержка streaming |
| Env-переменная | `OPENAI_API_KEY` (уже валидируется в `src/env.ts`) |
| Контекстное окно | Ограничено `MAX_CONTEXT_TOKENS = 6000` из `packages/shared/src/constants.ts` |
| Лимит сообщения | `MAX_USER_MESSAGE_LENGTH = 4000` (shared) |

## Требования

### Сервер (`apps/server`)
- [ ] Сервис `chat-service.ts` в `src/services/` — принимает plain data, возвращает `Result<T, E>`, без Express-типов
- [ ] Вызов `aiClient.responses.create({ model: 'gpt-4o-mini', stream: true })` с `for await` по чанкам
- [ ] System prompt хранится в `src/prompts/chat-system.ts` как builder-функция
- [ ] Rolling window: system prompt + последние N сообщений, вмещающиеся в `MAX_CONTEXT_TOKENS`
- [ ] Retry при 429/5xx через `p-retry` (max 3, exponential backoff)
- [ ] При `chat:send` от клиента — валидация через Zod-схему `clientMessageSchema`
- [ ] Стриминг чанков в WS: `{ type: 'chat:chunk', payload: { content } }`
- [ ] По завершении: `{ type: 'chat:done' }` + сохранение полного ответа в БД
- [ ] При ошибке: `{ type: 'error', payload: { code, message } }` — без стектрейсов
- [ ] Abort upstream OpenAI-запроса при закрытии WS-соединения клиентом (экономия токенов)
- [ ] Логирование `usage` (prompt_tokens, completion_tokens) после каждого completions

### Клиент (`apps/client`)
- [ ] Хук `useChatSocket` в `src/hooks/` — единственная точка работы с WebSocket
- [ ] Экспоненциальный реконнект (1s → 2s → 4s → max 30s), статус `'connecting' | 'open' | 'closed' | 'error'`
- [ ] Буфер чанков через `ref`, flush в state через `setContent` на каждом `chat:chunk`
- [ ] Мигающий курсор во время стриминга, скрытие по `chat:done` или ошибке
- [ ] Кнопка «Stop» в `Composer` отправляет закрытие/отмену
- [ ] Валидация входящих WS-сообщений через `serverMessageSchema` из `@ai-chat/shared`

### Shared (`packages/shared`)
- [ ] Типы `ClientMessage`, `ServerMessage` в `src/types/ws.ts` (уже заготовлены)
- [ ] Zod-схемы `clientMessageSchema`, `serverMessageSchema` в `src/schemas/chat.ts`
- [ ] Константы `MAX_CONTEXT_TOKENS`, `MAX_USER_MESSAGE_LENGTH` (уже есть)

## Затронутые части
- `apps/server` — `src/services/chat-service.ts` (новый), `src/prompts/chat-system.ts` (новый), WS-хэндлер в `server.ts`, `src/lib/ai-client.ts` (уже есть)
- `apps/client` — `src/hooks/useChatSocket.ts` (новый), `MessageList`, `Composer`, `ChatPage`
- `packages/shared` — `src/types/ws.ts`, `src/schemas/chat.ts`, `src/constants.ts`

## API-контракт (WebSocket)

```
Client → Server:
  { type: 'chat:send', payload: { conversationId: string, content: string } }

Server → Client:
  { type: 'chat:chunk', payload: { content: string } }
  { type: 'chat:done' }
  { type: 'error',      payload: { code: string, message: string } }
```

## Конфигурация модели
смотреть документацию >(https://github.com/openai/openai-node)

```ts
aiClient.responses.create({
  model: 'gpt-4o-mini',
  stream: true,
  instructions: systemPrompt,   // system prompt — отдельный параметр
  input: [
    ...truncatedHistory,         // только role: 'user' | 'assistant'
    { role: 'user', content: userMessage },
  ],
});

// Стриминг событий:
// event.type === 'response.output_text.delta'  → event.delta (string)
// event.type === 'response.completed'          → event.response.usage.input_tokens / output_tokens
```

## Открытые вопросы
- ~~SSE или WebSocket как основной транспорт?~~ → **WebSocket** (по backend instructions: ws + сохранение ответа для следующей сессии)
- Нужен ли отдельный эндпоинт SSE как fallback для WebSocket?
