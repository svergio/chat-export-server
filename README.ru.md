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

## Настройка

### Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `CHAT_EXPORT_HOME` | Каталог данных (по умолчанию `~/.chat-export`) |
| `CHAT_EXPORT_DB_DRIVER` | Драйвер БД |
| `CHAT_EXPORT_DB_URL` | URL БД |
| `CHAT_EXPORT_SKIP_MCP_CONFIG` | `1` — не писать Cursor MCP при `key new` |

### `config.json`

Пример (пароли смените на свои):

```json
{
  "host": "127.0.0.1",
  "port": 8765,
  "exportDir": "~/.chat-export/exports",
  "rpcTimeoutMs": 60000,
  "dashboard": {
    "enabled": true,
    "username": "admin",
    "password": "changeme"
  },
  "settings": {
    "platformsEnabled": ["chatgpt", "grok", "grok-x", "copilot", "claude"],
    "allowDestructive": false
  }
}
```

Сервер по умолчанию: **`127.0.0.1:8765`** (`/health`, `/mcp`, `/ws`, `/dashboard/`).

### Токены

| Префикс | Кто использует |
|---------|----------------|
| `cek_` / `cem_` | MCP и CLI (`Authorization: Bearer …`) |
| `ceb_` | Расширение Chrome, WebSocket `/ws` |

Хеши MCP-ключей в `keys.json`; plaintext — один раз при `key new`.

Демон в дереве сопровождения: `tmp-scripts/ensure-daemon.mjs` (порт `8765`, опция `--sync-mcp-json` для `.cursor/mcp.json`).

Расширение: [README extension — Настройка](https://github.com/svergio/chat-export-extension#%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0).

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

Донаты добровольны.

## Участие в разработке

[CONTRIBUTING.md](https://github.com/svergio/chat-export-extension/blob/main/CONTRIBUTING.md) (протокол, MCP, конфиг), [вики](https://github.com/svergio/chat-export-extension/wiki/Contributing-RU).

## Лицензия

[LICENSE](LICENSE).
