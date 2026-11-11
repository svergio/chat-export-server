[English](README.md) | [Русский](README.ru.md) · [![Поддержать на DonationAlerts](https://img.shields.io/badge/Поддержать-DonationAlerts-orange)](https://www.donationalerts.com/r/svwergio_mel)

# chat-export-server

**Локальный MCP-сервер** для расширения [Chat Export](https://github.com/svergio/chat-export-extension). Список, чтение, экспорт, создание, удаление и **вопросы** в ваших чатах ChatGPT, Grok, X Grok, Claude и GitHub Copilot — через расширение в **вашем** браузере. Всё на `127.0.0.1`: очереди задач, SQLite-кеш, аудит, опциональный [дашборд](https://github.com/svergio/chat-export-dashboard).

## Проблема

Агентам в IDE нужен **структурный доступ** к веб-сессиям LLM без утечки cookies и без облачных API. Нужны MCP, очереди и повторы — при этом данные не покидают ваш ПК.

## Платформы

| Платформа | Автоматизация |
|-----------|----------------|
| ChatGPT | list / get / export / create / delete / ask |
| Grok | то же |
| X Grok | то же |
| Claude | то же |
| GitHub Copilot (web) | то же |

```mermaid
flowchart TB
  EXT[Расширение Chrome] <-->|WS ceb_| HUB[Browser hub]
  HUB --> Q[Очереди по браузерам]
  Q --> MCP[MCP /mcp]
  MCP --> AGENT[Cursor и др.]
  HUB --> API[/dashboard/api]
  API --> UI[Дашборд]
  Q --> DB[(SQLite)]
```

## Быстрый старт (3 шага)

1. **Расширение** — [chat-export-extension](https://github.com/svergio/chat-export-extension), мост в popup, залогиненные вкладки.
2. **Сервер** — `npm install && npm run build`, `chat-export-server key new`, `chat-export-server start`.
3. **MCP** — URL `http://127.0.0.1:8765/mcp`, Bearer-ключ, `browsers_bind`, затем инструменты чатов.

## Установка

```sh
npm install
npm run build
```

Нужен **Node 22.13+**.

```sh
chat-export-server key new
chat-export-server start
```

Данные: `~/.chat-export` (`CHAT_EXPORT_HOME` для переопределения).

## MCP в Cursor (HTTP)

```json
{
  "mcpServers": {
    "chat-export": {
      "url": "http://127.0.0.1:8765/mcp",
      "headers": {
        "Authorization": "Bearer cek_YOUR_KEY_HERE"
      }
    }
  }
}
```

## Инструменты MCP (кратко)

`browsers_*`, `platforms_list`, `chats_*`, `chat_ask`, `jobs_*`, `chat_cache_*` — см. [вики](https://github.com/svergio/chat-export-extension/wiki).

## Безопасность

- По умолчанию только **127.0.0.1**.
- Ключи `cek_`/`cem_` и `ceb_` — раздельно; не публикуйте.
- Удаление — с `allowDestructive` и `confirm: true`.
- [SECURITY.md](SECURITY.md). Соблюдайте **ToS** провайдеров.

## Репозитории

| Репозиторий | Роль |
|-------------|------|
| [extension](https://github.com/svergio/chat-export-extension) | UI и мост |
| [server](https://github.com/svergio/chat-export-server) (этот) | MCP и очереди |
| [dashboard](https://github.com/svergio/chat-export-dashboard) | UI оператора |
| [Wiki](https://github.com/svergio/chat-export-extension/wiki) | Документация |

## Поддержка проекта

- **DonationAlerts:** [svwergio_mel](https://www.donationalerts.com/r/svwergio_mel)
- **Крипто:** только публичные адреса из документации с указанием сети; проверяйте строку перед отправкой.

Донаты добровольны.

## Лицензия

[LICENSE](LICENSE).
