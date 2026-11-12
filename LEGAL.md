# Legal Notice, Open-Source License & Account Risk Disclaimer / Юридическое уведомление, лицензия Open Source и отказ от ответственности

[English](#english) | [Русский](#русский)

---

## English

### 1. Open-Source Software ("AS IS")

**Chat Export** ([chat-export-extension](https://github.com/svergio/chat-export-extension), [chat-export-server](https://github.com/svergio/chat-export-server), and [chat-export-dashboard](https://github.com/svergio/chat-export-dashboard)) is free, open-source software released under the [MIT License](LICENSE).

The software is provided **"AS IS"**, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.

### 2. Third-Party Terms of Service & Account Risk

Chat Export interacts with third-party AI web interfaces and internal page APIs (including **ChatGPT**, **Grok**, **X Grok**, **Claude**, **Microsoft Copilot**, **Qwen**, **DeepSeek**, and **Perplexity**) inside your own authenticated browser session.

- Automated DOM interaction, script injection, bulk conversation export, or MCP-driven prompt execution **may violate the Terms of Service (ToS)** of these third-party platforms.
- Third-party providers may apply rate limits, CAPTCHA challenges, session invalidation, or **temporary/permanent account suspension or ban**.
- **You use Chat Export and its MCP automation features entirely at your own risk.** The authors assume no responsibility for restricted, rate-limited, or terminated third-party accounts.

### 3. Local-Only Architecture & Privacy

- All chat transcripts, SQLite cache entries, logs, and authentication tokens (`cem_` MCP keys, `ceb_` browser enrollment keys, and dashboard session cookies) remain **strictly local** on your machine (`127.0.0.1` by default).
- Chat Export contains **zero telemetry**, analytics, or external cloud relays.

### 4. No Affiliation

Chat Export is an independent open-source project and is not affiliated with, endorsed by, or sponsored by OpenAI, xAI, X Corp., Anthropic, Microsoft, Alibaba Cloud (Qwen), DeepSeek, or Perplexity AI.

### 5. Reporting Issues

Web UIs change frequently. If a provider update breaks selectors, export formatting, or bridge actions, please open an issue:
- Extension & UI adapters: <https://github.com/svergio/chat-export-extension/issues>
- Server, MCP & Dashboard: <https://github.com/svergio/chat-export-server/issues>
- Dashboard UI: <https://github.com/svergio/chat-export-dashboard/issues>

---

## Русский

### 1. Свободное ПО с открытым исходным кодом («КАК ЕСТЬ»)

**Chat Export** ([chat-export-extension](https://github.com/svergio/chat-export-extension), [chat-export-server](https://github.com/svergio/chat-export-server) и [chat-export-dashboard](https://github.com/svergio/chat-export-dashboard)) — бесплатное программное обеспечение с открытым исходным кодом, распространяемое по [лицензии MIT](LICENSE).

Программное обеспечение предоставляется на условиях **«КАК ЕСТЬ» (AS IS)**, без каких-либо прямых или косвенных гарантий, включая, помимо прочего, гарантии товарной пригодности, пригодности для конкретной цели и отсутствия нарушения прав. Авторы и правообладатели ни при каких обстоятельствах не несут ответственности за любые претензии, ущерб или иные обязательства, возникшие в результате использования или невозможности использования данного ПО.

### 2. Условия использования сторонних платформ и риски для аккаунтов

Chat Export взаимодействует со сторонними веб-интерфейсами и внутренними API ИИ-платформ (**ChatGPT**, **Grok**, **X Grok**, **Claude**, **Microsoft Copilot**, **Qwen**, **DeepSeek**, **Perplexity**) внутри вашей авторизованной браузерной сессии.

- Автоматизированное управление DOM, массовый экспорт диалогов или выполнение команд через MCP **может нарушать Условия использования (Terms of Service)** указанных сервисов.
- Провайдеры могут применить ограничение частоты запросов (rate-limiting), проверку CAPTCHA, принудительный выход из сессии либо **временную или постоянную блокировку (бан) аккаунта**.
- **Вы используете экспорт и MCP-автоматизацию исключительно на свой страх и риск.** Авторы проекта не несут ответственности за ограничения или блокировку ваших учетных записей на сторонних платформах.

### 3. Локальная архитектура и конфиденциальность

- Все экспортируемые чаты, кеш SQLite, логи и ключи безопасности (`cem_` для MCP, `ceb_` для браузеров и сессионные cookie дашборда) хранятся **строго локально** на вашем устройстве (по умолчанию `127.0.0.1`).
- В проекте **отсутствует телеметрия**, аналитика и передача данных на сторонние облачные серверы.

### 4. Отсутствие аффилированности

Chat Export — независимый проект с открытым исходным кодом, не связанный, не одобренный и не спонсируемый OpenAI, xAI, X Corp., Anthropic, Microsoft, Alibaba Cloud (Qwen), DeepSeek или Perplexity AI.

### 5. Сообщения об ошибках

Верстка нейросетей регулярно обновляется. Если обновление интерфейса провайдера сломало селекторы, экспорт или работу моста, создайте задачу в GitHub Issues:
- Расширение и адаптеры платформ: <https://github.com/svergio/chat-export-extension/issues>
- Сервер, MCP и дашборд: <https://github.com/svergio/chat-export-server/issues>
- Интерфейс дашборда: <https://github.com/svergio/chat-export-dashboard/issues>
