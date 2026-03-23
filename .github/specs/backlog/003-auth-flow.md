# Feature: Auth Flow

## Контекст
Аутентификация пользователей через JWT для защиты API и WebSocket-соединений.

## Требования
- [ ] Регистрация (email + пароль)
- [ ] Логин с выдачей JWT
- [ ] Middleware проверки токена на всех защищённых роутах
- [ ] Аутентификация WebSocket-соединения при upgrade
- [ ] Форма логина/регистрации на клиенте
- [ ] Хранение токена и автообновление

## Затронутые части
- `apps/client` — страницы auth, хук `useAuth`, protected routes
- `apps/server` — `middleware/auth.ts`, роутер auth, модель User
- `packages/shared` — типы `AuthRequest`, `AuthResponse`

## API-контракт
- `POST /api/v1/auth/register` — `{ email, password }` → `{ token, user }`
- `POST /api/v1/auth/login` — `{ email, password }` → `{ token, user }`

## Открытые вопросы
- OAuth-провайдеры (Google, GitHub) на первом этапе?
- Refresh-токены или только access?
