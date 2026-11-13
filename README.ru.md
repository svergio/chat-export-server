[English](README.md) | [Русский](README.ru.md) · [![Поддержать на DonationAlerts](https://img.shields.io/badge/Поддержать-DonationAlerts-orange)](https://www.donationalerts.com/r/svwergio_mel) · [![chat-export-server MCP server](https://glama.ai/mcp/servers/svergio/chat-export-server/badges/score.svg)](https://glama.ai/mcp/servers/svergio/chat-export-server) · [![MCP Servers](https://img.shields.io/badge/MCP_Servers-listed-2563eb)](https://mcpservers.org/ru/) · [![Chat Export MCP on mcprush](https://mcprush.com/badge/chat-export-mcp/score.svg)](https://mcprush.com/to/chat-export-mcp?ref=badge)

# chat-export-server

<p align="center">
  <img src="docs/media/demo-server.gif" alt="Старт на :8765, health, два профиля Chrome online/offline" width="720" />
</p>

**Локальный MCP-сервер** для расширения [Chat Export](https://github.com/svergio/chat-export-extension). Список, чтение, экспорт, создание, удаление и **вопросы** в ваших чатах на **одиннадцати** площадках (ChatGPT, Grok, X Grok, Claude, GitHub Copilot, Qwen, DeepSeek, Perplexity, Kimi, Z.ai, MiniMax) — через расширение в **вашем** браузере. (**JanitorAI** — только панель экспорта в расширении, в MCP/protocol не входит.) Всё на `127.0.0.1`: очереди задач, SQLite-кеш, аудит, опциональный [дашборд](https://github.com/svergio/chat-export-dashboard).

В каталоге [Glama](https://glama.ai/mcp/servers/svergio/chat-export-server) (v1.0.9, Kimi / Z.ai / MiniMax MCP). Также в [Mcprush](https://mcprush.com/svergio/chat-export-mcp).

## Автономный продукт

`chat-export-server` вместе с [расширением Chrome](https://github.com/svergio/chat-export-extension) — полный локальный стек. Операции с чатами в браузере идут через WebSocket-мост расширения — **без** Chrome DevTools MCP, Playwright и без встроенного кода агентов. Деплой **нативно**, **Docker / Colima** или **Kubernetes** (`deploy/k8s`). Любой MCP-клиент (Cursor, Claude Desktop, Open WebUI, локальные LLM вроде Bonsai-27B) — **опционален**.

## Зачем этот MCP (для ревьюеров awesome-list)

Большинство LLM MCP оборачивают **HTTP API вендора** (ключи, квоты, облако). Chat Export другой: агент говорит MCP с **локальным** процессом; тот управляет **веб-UI, в которые вы уже залогинены**, через мост расширения Chrome. Для chat-ops не нужны API-ключи OpenAI/Anthropic/xAI, тела чатов не уходят с `127.0.0.1`, create/delete выключены, пока вы сами не включите (`allowDestructive` + `confirm`). Пара: [zip расширения](https://github.com/svergio/chat-export-extension/releases) → Cursor (или любой MCP-клиент) на `http://127.0.0.1:8765/mcp`.

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
| Qwen | то же |
| DeepSeek | то же |
| Perplexity | то же |
| Kimi (`kimi.com`) | то же |
| Z.ai (`chat.z.ai`) | то же |
| MiniMax (`agent.minimax.io`) | то же |

## Архитектура

`chat-export-server` слушает loopback (по умолчанию), принимает **browser hub** от расширения по WebSocket (`/ws`, токены `ceb_`), отдаёт **MCP** по HTTP на `/mcp` для IDE (`cem_`/`cek_`), ведёт **очереди задач по браузерам** с SQLite-кешем и WAL и при необходимости раздаёт встроенный **дашборд** на `/dashboard/` и `/dashboard/api`. Длительные операции (`chat_ask`, пакетный экспорт, удаление с ограничениями) идут через очередь, а не блокируют MCP.

Деплой: **нативный** CLI на Node 22, **Docker / Colima** (Compose на `127.0.0.1:8765`) или **Kubernetes** (`kubectl apply -k deploy/k8s`, port-forward для моста Chrome). **Диаграммы Mermaid** и карта эндпоинтов: **[Вики — Архитектура](https://github.com/svergio/chat-export-extension/wiki/Architecture-RU)**. См. также [Нативный деплой, Docker и Kubernetes](https://github.com/svergio/chat-export-extension/wiki/Native-and-Kubernetes-Deployment-RU) · [Сценарии использования](https://github.com/svergio/chat-export-extension/wiki/Use-Cases-RU) · [MCP: инструменты и профили](https://github.com/svergio/chat-export-extension/wiki/MCP-Tools-and-Profiles-RU).

## Быстрый старт (3 шага)

1. **Расширение** — [chat-export-extension](https://github.com/svergio/chat-export-extension), мост в popup, залогиненные вкладки.
2. **Сервер** — `npm install && npm run build`, `chat-export-server key new`, `chat-export-server start`.
3. **MCP** — URL `http://127.0.0.1:8765/mcp`, Bearer-ключ, `browsers_bind`, затем инструменты чатов.

## Установка и сборка

```sh
npm install
npm run build   # tsc -> dist/
npm link        # опционально: chat-export-server в PATH
```

Нужен **Node 22.13+** (`node:sqlite`).

| Скрипт | Назначение |
| --- | --- |
| `npm run build` | компиляция в `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm start` | `node dist/cli/index.js start` |
| `npm run dev` | `tsx watch … start` |
| `npm run mcp` | stdio MCP |

### Первый запуск

```sh
chat-export-server key new    # plaintext один раз; в файле — хеш
chat-export-server start
# WS   /ws, /ext  — мост расширения
# MCP  /mcp       — Bearer
# GET  /health
```

Данные в `~/.chat-export` (или `CHAT_EXPORT_HOME`):

```text
~/.chat-export/
  config.json    # host, port, exportDir, settings (в т.ч. advancedMcpTosAcceptedAt)
  chat-export.db # SQLite: mcp_tokens, browsers, browser_revoked_tokens, jobs, кеш чатов
  audit.log
  exports/
```

Токены MCP и браузера хранятся как хеши в SQLite. Plaintext печатается один раз при `key new` / enroll; файла `keys.json` для этого нет.

Перед create/send/delete через MCP один раз примите Advanced MCP ToS: `chat-export-server tos accept` или `POST /legal/accept` (loopback). Статус: `GET /legal` / `tos status`.

```sh
chat-export-server key rotate
chat-export-server key list
chat-export-server status
```

## Настройка

### Переменные окружения

Скопируйте [`.env.example`](.env.example) в `.env`, затем `chmod 600 .env`. Не коммитьте `.env` (в `.gitignore`); в `.env.example` только плейсхолдеры. Переменные окружения перекрывают `config.json`, где указано ниже.

| Переменная | Назначение |
|------------|------------|
| `CHAT_EXPORT_HOME` | Каталог данных (`~/.chat-export`; в Docker — `/data`) |
| `CHAT_EXPORT_HOST` | Адрес bind (`127.0.0.1` локально; в контейнере — `0.0.0.0`) |
| `CHAT_EXPORT_PORT` | Порт HTTP (по умолчанию `8765`) |
| `CHAT_EXPORT_ALLOWED_HOSTS` | Доп. имена заголовка `Host` (через запятую) |
| `CHAT_EXPORT_DASHBOARD_ENABLED` | `true` / `false` |
| `CHAT_EXPORT_ADMIN_USER` / `CHAT_EXPORT_ADMIN_PASS` | Логин дашборда |
| `CHAT_EXPORT_MCP_TOKEN` | Опциональный `cem_…` при старте |
| `CHAT_EXPORT_BROWSER_TOKENS` | Авто-энролл `browserId:ceb_…[:label]` |
| `CHAT_EXPORT_ALLOW_DESTRUCTIVE` | `true` / `false` |
| `CHAT_EXPORT_DB_DRIVER` | Драйвер БД |
| `CHAT_EXPORT_DB_URL` | URL БД |
| `CHAT_EXPORT_SKIP_MCP_CONFIG` | `1` — не писать Cursor MCP при `key new` |

### Docker и Colima

В репозитории есть [`Dockerfile`](Dockerfile) (Node 22 Alpine, непривилегированный пользователь, том `/data`, `HEALTHCHECK` на `/health`). **Docker Desktop не нужен** — на macOS используйте [Colima](https://github.com/abiosoft/colima):

```sh
colima start
docker context use colima
cp .env.example .env    # задайте CHAT_EXPORT_ADMIN_PASS
docker --context colima compose build
docker --context colima compose up -d
curl -sS http://127.0.0.1:8765/health
```

Порт только **`127.0.0.1:8765`**. Данные — volume `chat-export-data`.

После проверки остановите контейнер, чтобы локальный демон снова мог слушать `:8765`:

```sh
docker --context colima compose down
```

Раздельный фронт nginx (статика дашборда + прокси API/MCP/WS): см. [chat-export-dashboard](https://github.com/svergio/chat-export-dashboard) и `docker-compose.yml` в дереве сопровождения Chat Export.

### Kubernetes

Манифесты в [`deploy/k8s/`](deploy/k8s/) (non-root UID `10001`, PVC `/data`, пробы `/health`, Ingress с WebSocket для `/ws`, `/ext`, `/mcp`). Деплой: `kubectl apply -k deploy/k8s`; для моста Chrome с хоста — `kubectl port-forward` на `127.0.0.1`. Подробнее: [deploy/k8s/README.md](deploy/k8s/README.md), вики [Native and Kubernetes deployment (RU)](https://github.com/svergio/chat-export-extension/wiki/Native-and-Kubernetes-Deployment-RU).

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
    "allowDestructive": false,
    "exportSchema": "chat-export/1"
  }
}
```

`settings.exportSchema` по умолчанию `chat-export/1` (также `sharegpt/1`). MCP `chats_export` / jobs принимают опциональный `schema`; без него — эта настройка, затем дефолт браузера. Вики: [Форматы экспорта](https://github.com/svergio/chat-export-extension/wiki/Export-Formats-RU).

Сервер по умолчанию: **`127.0.0.1:8765`** (`/health`, `/mcp`, `/ws`, `/dashboard/`).

### Токены

| Префикс | Кто использует |
|---------|----------------|
| `cek_` / `cem_` | MCP и CLI (`Authorization: Bearer …`) |
| `ceb_` | Расширение Chrome, WebSocket `/ws` |

Хеши MCP/browser-ключей в SQLite (`mcp_tokens`, `browsers`, `browser_revoked_tokens`); plaintext — один раз при `key new` / enroll.

После настройки MCP выполните **`browsers_bind`**, чтобы инструменты целились в подключённый профиль Chrome.

Расширение: [README extension — Настройка](https://github.com/svergio/chat-export-extension#%D0%BD%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0).

## Фоновые задачи

Долгие операции (`chat_ask`, экспорт, пакетное удаление) идут по очередям **на браузер**:

- `jobs_enqueue`, `jobs_status`, `jobs_list`, `jobs_cancel`

## MCP в Cursor

HTTP (сервер уже запущен):

```json
{
  "mcpServers": {
    "chat-export": {
      "url": "http://127.0.0.1:8765/mcp",
      "headers": {
        "Authorization": "Bearer cem_YOUR_KEY_HERE"
      }
    }
  }
}
```

stdio:

```json
{
  "mcpServers": {
    "chat-export": {
      "command": "chat-export-server",
      "args": ["start", "--stdio"],
      "env": {
        "CHAT_EXPORT_HOME": "/Users/YOU/.chat-export"
      }
    }
  }
}
```

Профили инструментов (полный набор vs урезанный read-focus): вики [MCP: инструменты и профили](https://github.com/svergio/chat-export-extension/wiki/MCP-Tools-and-Profiles-RU).

## Инструменты MCP (обзор)

| Инструмент | Назначение |
| --- | --- |
| `browsers_list` / `browsers_bind` / `browsers_status` | Профили Chrome |
| `platforms_list` | Матрица включения |
| `chats_list` / `chats_get` / `chats_export` | Чтение и экспорт |
| `chats_create` / `chats_delete` | UI-драйв (delete нужен `confirm: true`) |
| `chat_ask` | Промпт; wait или очередь |
| `jobs_*` | Асинхронный пайплайн |
| `chat_cache_*` | Временный SQLite-кеш длинных тредов |

Полный список — в вики **MCP Tools**.

## Опционально: локальная LLM (например Bonsai-27B)

Любой **внешний** MCP-клиент (Cursor, Claude Desktop, Open WebUI или свой агент) может вызывать Streamable HTTP на `http://127.0.0.1:8765/mcp`. Локальный OpenAI-совместимый рантайм вроде **Bonsai-27B** (oMLX и т.п. на `:8000/v1`) — **опциональный** оркестратор; Chat Export **не** поставляет и не встраивает код агентов. Пример: локальная модель планирует шаги, этот сервер выполняет `chat_ask` / `jobs_*` во вкладках Chrome под вашей сессией. Руководство: вики [Local LLM + Bonsai-27B](https://github.com/svergio/chat-export-extension/wiki/Local-LLM-Bonsai-27B-Guide-RU) ([EN](https://github.com/svergio/chat-export-extension/wiki/Local-LLM-Bonsai-27B-Guide)).

## Структура репозитория

```text
packages/protocol/   контракт v1
src/core/            config, keys, audit, db, jobs, cache
src/hub/             WebSocket BrowserHub
src/mcp/             MCP HTTP + stdio
src/cli/             CLI
src/dashboard-api.ts /dashboard/api + dashboard/public
dashboard/           git submodule → chat-export-dashboard
```

После клона: `git submodule update --init`.

## Безопасность

- По умолчанию только **127.0.0.1**. Меняйте host, только если понимаете экспозицию.
- Ключи `cek_`/`cem_` дают полный локальный API — не коммитьте и не публикуйте.
- Токены браузера (`ceb_`) отделены от MCP.
- `chats_delete` и аналоги: `allowDestructive` на расширении **и** сервере + `confirm: true`.
- Append-only **audit** для чувствительного RPC. См. [SECURITY.md](SECURITY.md).
- Цель — портативность ваших данных; **ToS** провайдеров соблюдать должны вы. Это не юрконсультация.

## FAQ

- Нет телеметрии; ядро не ходит на внешние серверы.
- Только **ваши** чаты из **вашей** сессии браузера.
- Общие формулировки: [packages/faq.md](packages/faq.md).

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

[CONTRIBUTING.md](./CONTRIBUTING.md) (сборка, `deploy/k8s`, синхронизация dashboard, ветка `test`), [extension CONTRIBUTING](https://github.com/svergio/chat-export-extension/blob/main/CONTRIBUTING.md) / [RU](https://github.com/svergio/chat-export-extension/blob/main/CONTRIBUTING.ru.md), [вики](https://github.com/svergio/chat-export-extension/wiki/Contributing-RU).

## Зависимости

**Runtime:** Node 22.13+, `@modelcontextprotocol/sdk`, `ws`, `zod`, workspace `@chat-export/protocol` (ISC, `packages/protocol/`). В production нет Playwright, Puppeteer, Electron и облачных SDK.

**Связка продуктов:** [chat-export-extension](https://github.com/svergio/chat-export-extension) (WebSocket `ceb_`) ↔ этот сервер ↔ [chat-export-dashboard](https://github.com/svergio/chat-export-dashboard) (субмодуль `dashboard/`).

Docker: **node:22-alpine**; опционально фронт dashboard на **nginx:alpine**. `package-lock.json` в репозитории — для Dependabot и графа зависимостей GitHub.

Сторонние пакеты: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) (`npm run licenses`). SBOM по желанию: `npm sbom --omit dev`.

**Не обязательны:** Cursor, Open WebUI, BibLLMsteak, Bonsai-27B, пути NodeRed — только MCP-клиенты или документация сопровождения.

## Лицензия

[LICENSE](LICENSE).
