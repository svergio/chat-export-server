# Участие в разработке chat-export-server

[English](CONTRIBUTING.md) | [Русский](CONTRIBUTING.ru.md)

Локальный MCP-шлюз для [Chat Export](https://github.com/svergio/chat-export-extension). Вместе с `chat-export-extension` (мост) и `chat-export-dashboard` (UI в `dashboard/`).

Без `Co-authored-by` в коммитах. Фичи — в `main`; adversarial/contract тесты сначала на ветке `test`.

См. также: [CONTRIBUTING extension](https://github.com/svergio/chat-export-extension/blob/main/CONTRIBUTING.ru.md), [SECURITY.md](./SECURITY.md).

## Требования

- **Node.js** 22.13+
- **npm** workspaces (`packages/protocol`)
- Опционально: Docker / Colima, kubectl для `deploy/k8s/`

## Сборка

```bash
npm ci
npm run build
npm run typecheck
npm run schema
```

При смене runtime-зависимостей: `npm run licenses` → [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Тесты (гейт ветки `test`)

CI на **`test`** и **`main`** (`.github/workflows/ci.yml`).

```bash
npm test
```

Враждебные кейсы (битые тела, токены, delete без confirm, path traversal в именах экспорта, миграции) — сначала на `test`. Сьюты детерминированные, &lt; ~15s. Merge `test` → `main` только при зелёном CI.

## Пакет protocol

| Задача | Путь / команда |
|--------|----------------|
| Id платформ | `packages/protocol/src/constants.js` (`PLATFORMS`) |
| RPC | `packages/protocol/src/schema.js` |
| Фикстуры | `packages/protocol/fixtures/` |
| Schema | `npm run schema` |

Те же строки id, что в content scripts расширения и MCP.

## Встроенный dashboard

Статика из `dashboard/public/`. После правок в sibling-репо:

```bash
cd ../chat-export-dashboard
npm ci && npm run build
rsync -a --delete public/ ../chat-export-server/dashboard/public/
```

Закоммитьте submodule / копию при релизе dashboard.

## Docker и Kubernetes

| Стек | Путь |
|------|------|
| Compose | `docker-compose.yml` |
| OCI | `Dockerfile` |
| K8s | `deploy/k8s/` |
| Publish | `.github/workflows/publish-oci.yml` на тегах Release |

Если есть `deploy/k8s/`, CI делает `kubectl kustomize deploy/k8s`.

## Конфиг и MCP

- Bind по умолчанию: `127.0.0.1` (см. README)
- Токены: `cem_` (MCP), `ceb_` (мост)
- Streamable HTTP MCP: `/mcp`

## Гигиена PR

- Падение CI / MR: правило `.cursor/rules/chat-export-mr-review-after-tests.mdc` (что / почему / импакт / фикс)
- Один логический change на PR
- Без секретов в коммитах
- Обновляйте README при user-facing рисках / деплое
- Ссылайтесь на связанные PR extension/dashboard

Вопросы: [Issues](https://github.com/svergio/chat-export-server/issues).
