# TrustGate — Local role-based backend

NexusTech Ltd. একটি কাল্পনিক কোম্পানি। এই backend তিনটি demo role-এর জন্য তথ্যের access আলাদা করে। AI API, database বা third-party package ছাড়াই প্রথম demo চলে।

## VS Code-এ চালাও

1. ZIP extract করো। VS Code-এ **File → Open Folder** দিয়ে `trustgate-backend` folder খুলে নাও।
2. **Terminal → New Terminal**। `node -v` দিয়ে Node.js 22 বা নতুন version আছে কি না দেখো।
3. প্রথম terminal-এ চালাও:

   ```sh
   npm start
   ```

4. প্রথম terminal খোলা রেখে আরেকটা terminal-এ চালাও:

   ```sh
   npm run demo
   npm test
   ```

`npm install` লাগবে না। Windows PowerShell-এ execution policy যদি `npm.ps1` আটকে দেয়, `npm.cmd start`, `npm.cmd run demo` ও `npm.cmd test` ব্যবহার করো।

`npm run demo`-এর মূল ফলাফল:

| Role | প্রশ্ন | ফলাফল |
| --- | --- | --- |
| Intern | What are the office hours? | `200` · অফিস সময় |
| Intern | What is the confidential budget? | `403 ACCESS_DENIED` |
| Admin | What is the confidential budget? | `200` · BDT 1,200,000 (fictional) |

ডেমোর শেষে Admin audit log-এ সবচেয়ে সাম্প্রতিক permission decisions-এর table দেখাবে।

## তোর main কাজ কোথায়

| ফাইল | দায়িত্ব |
| --- | --- |
| `src/policy.js` | কোন role কোন শ্রেণির record পড়তে পারবে |
| `src/server.js` | Demo session, request validation, permission gate ও API response |
| `src/catalog.js` | প্রশ্ন থেকে পরিচিত topic মেলানো |
| `data/company.json` | Server-only fictional record এবং topic aliases |
| `src/answer.js` | অনুমোদিত একটি record থেকে উত্তর। এখন local stub, পরে AI adapter |
| `src/audit.js` | সর্বশেষ ১০০টি permission decision-এর in-memory log |
| `test/server.test.js` | API এবং permission integration tests |

Access levels:

| Role value | Public | Employee | Confidential |
| --- | --- | --- | --- |
| `intern` | ✓ | — | — |
| `employee` | ✓ | ✓ | — |
| `admin` | ✓ | ✓ | ✓ |

## Frontend teammate-এর API contract

Base URL `http://127.0.0.1:3000`। `GET /health` চালিয়ে backend ready কি না দেখা যায়।

1. Dropdown থেকে role বদলালে `POST /api/demo/session` পাঠাও। JSON body `{"role":"intern"}`। CEO/Admin label-এর API value `admin`। `201` response থেকে `token` নাও এবং frontend state-এ রাখো। Role বদলানোর পর নতুন token ব্যবহার করো এবং আগের role-এর chat UI clear করো।
2. প্রশ্নে `POST /api/chat` পাঠাও। Headers-এ `Content-Type: application/json` ও `Authorization: Bearer <token>`। JSON body-তে শুধু `message` থাকবে, যেমন `{"message":"What is the confidential budget?"}`।
3. `200` হলে `answer` দেখাও। `403` ও `code: "ACCESS_DENIED"` হলে লাল alert দেখাও। `401` হলে role আবার select করতে বলো। `422` হলে supported topic থেকে একবারে একটি প্রশ্ন করতে বলো।

Default browser origins হলো `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:5500` ও `http://127.0.0.1:5500`। অন্য local port হলে `FRONTEND_ORIGIN`-এ exact origin set করে backend restart করো। যেমন PowerShell-এ:

```powershell
$env:FRONTEND_ORIGIN = "http://localhost:5174"
npm start
```

Live Server বা অন্য static server দিয়ে শুধু **frontend-এর folder** serve করবে, backend-এর `data/` folder নয়।

### Admin Audit Log

`GET /api/audit`-এ `Authorization: Bearer <admin-demo-token>` পাঠাও। `200` হলে response-এ `events` array পাবি, নতুন event আগে। উদাহরণ:

```json
{"events":[{"timestamp":"2026-11-19T12:00:00.000Z","role":"intern","decision":"denied","reasonCode":"ACCESS_DENIED"}]}
```

- Token না থাকলে বা expire হলে `401`। Intern/Employee token থাকলে `403`। Admin UI-তে chat request শেষ হলে বা **Refresh Audit Log** চাপলে আবার `GET` করো। Role বদলালে পুরোনো audit data UI থেকে clear করো।
- `allowed` মানে permission check পাস করেছে। এটি AI provider সফলভাবে উত্তর দিয়েছে, এমন দাবি নয়। Unknown topic বা validation error এই permission log-এ আসে না।
- প্রশ্নের লেখা, উত্তর, record ID/value, session token বা API key log করা হয় না। API সর্বশেষ ১০০টি event দেয়। Default demo বা local JSON login mode-এ backend restart হলে log মুছে যায়। PostgreSQL mode-এ log থাকে। Admin এখানে একটি **demo role**, আসল পরিচয় যাচাই নয়।

### Prompt Scanner

`POST /api/security/scan`-এ demo bearer token এবং `{"prompt":"Contact demo@example.com"}`
পাঠাও। API সর্বোচ্চ ১,০০০ অক্ষর নেয়। ফলাফলে `risk_score`, `risk_level`,
`decision`, `threats` (category names), আর `masked_prompt` আসে। Python 3.12+
লাগবে, কোনো Python package ইনস্টল লাগবে না। প্রয়োজনে `TRUSTGATE_PYTHON`-এ
interpreter-এর absolute path দাও। Python না চললে scan `503 SCANNER_UNAVAILABLE`
দেবে, তবে chat আর audit চলবে। Scan-এর input বা result audit log-এ লেখা হয় না।

## AI teammate-এর integration point

`src/answer.js`-এর `generateAnswer({ question, record })` function replace করো। অনুমোদিত হলে backend শুধু user question এবং একটি record-এর `id`, `title`, `content` পাঠায়। Function-এর return value একটি string। Provider call server-side রাখো এবং API key environment variable থেকে নাও। Model-কে পুরো catalog, role নির্ধারণের দায়িত্ব বা data-fetching tool দিও না। Blocked request-এ function call-ই হয় না। Test suite এটা যাচাই করে।

## Demo-এর সীমা

- Dropdown-এর role selection দিয়ে যে কেউ local demo-তে Admin বেছে নিতে পারে। Token শুধু server-এ নির্বাচিত demo role ধরে রাখে। এটা login বা পরিচয় যাচাই নয়। Session ৩০ মিনিটে expire হয় এবং backend restart-এ মুছে যায়।
- Keyword aliases দিয়ে topic চেনা হয়, তাই সব natural-language phrasing support করে না। Unknown topic বা একাধিক অনুমোদিত topic-এর প্রশ্নে `422` আসে। কোনো matching topic role-এর জন্য নিষিদ্ধ হলে `403` আসে।
- Company data পুরোপুরি fictional। Demo endpoint এবং dataset বাস্তব তথ্য বা production access control-এর জন্য নয়।

## Local account login milestone

This is the backend-only login mode. The existing frontend still uses the demo role
picker until the frontend login work is added. The normal `npm start` command keeps
the existing no-sign-in demo working.

1. From `TrustGate-backend`, run `npm run login:setup` once. It creates three local
   test accounts (Intern, Employee, and Admin), prints the generated passwords once,
   and stores only salted hashes in the ignored `.local-accounts.json`. Setup does
   not overwrite existing accounts.
2. Stop the old server, then run `npm run start:login`. Check `GET /health` for
   `mode: "local-login"`. On PowerShell use `npm.cmd` if needed.
3. Run `npm test` to verify both modes and all three account permissions.

In login mode, `POST /api/auth/login` accepts exactly `email` and `password`, sets an
HttpOnly, SameSite=Strict cookie, and returns `{ user: { email, role } }`.
`GET /api/auth/me` returns the session identity, and `POST /api/auth/logout`
invalidates the session. Chat, audit and scanner use the same cookie. The
`/api/demo/session` endpoint is disabled in login mode. For frontend integration
use a Vite proxy or `credentials: "include"` with the same hostname on both ports
(for example, 127.0.0.1); never store the session in frontend storage.

The login CLI is loopback-only. Accounts are local, and sessions are in memory.
The local cookie uses HTTP. Public deployment, a database-backed account store
and HTTPS cookie configuration are separate work.

## PostgreSQL account login

The default demo (`npm start`) and JSON-backed local login (`npm run start:login`)
still work. Use the commands below for the separate PostgreSQL-backed mode.
The frontend login page is separate. Sessions are still held in memory,
so sign in again after a backend restart.

1. Install PostgreSQL and create a non-superuser login role named
   `trustgate_app` and a database named `trustgate` owned by that role.
   The default connection is `127.0.0.1:5432`. If needed, override `PGHOST`,
   `PGPORT`, `PGUSER` and `PGDATABASE`.
2. In `TrustGate-backend`, run `npm ci` and then `npm run postgres:setup`.
   Enter the database connection password, then choose a separate password
   of at least 5 characters for each TrustGate account. Prompts do not echo
   the input. The transaction creates `trustgate_accounts` and inserts
   `intern@trustgate.example`, `employee@trustgate.example` and
   `admin@trustgate.example` with scrypt hashes and salts. Setup does not
   overwrite existing accounts.
3. Stop any old backend and run `npm run start:postgres`. Enter only the
   database connection password at startup. The application does not save it
   to a file. `GET /health` shows `mode: "postgres-login"`. The login, me and
   logout endpoints and the HttpOnly cookie contract are unchanged.
4. On PowerShell, use `npm.cmd` in place of `npm` if needed. Tests can be run
   with `npm test` without connecting to your local database.


## PostgreSQL audit history

In PostgreSQL login mode, `npm run start:postgres` automatically creates the
`trustgate_audit_events` table if it does not exist. Existing accounts do not
need to be recreated. The default demo and JSON login modes keep their separate,
in-memory audit history.

The Admin-only `GET /api/audit` contract remains `{ events: [...] }` with the
newest 100 decisions. The database keeps audit history across backend restarts.
Only timestamp, role, decision and reason code are returned. Prompts, answers,
record details and tokens are not stored in the audit table.

If the audit store is unavailable, audit reads and attempts that need to record
an access decision return `503 AUDIT_UNAVAILABLE`. An approved record is not
sent to the answer provider unless its permission decision has been saved.

## Admin Vault API (PostgreSQL mode)

Run `npm ci` in `TrustGate-backend` after adding this feature. The PostgreSQL
backend creates the document table at startup without needing to seed accounts
again. Original file bytes stay private in PostgreSQL. The endpoints below use
the same account session cookie as chat.

| Request | Account | Result |
| --- | --- | --- |
| `GET /api/vault/documents` | Admin | Up to 100 newest metadata rows, including pending or archived files. |
| `POST /api/vault/documents` | Admin | Multipart fields `title`, `accessLevel`, and one `file`. Accepts PDF, DOCX and XLSX up to 5 MiB. |
| `PATCH /api/vault/documents/:id` | Admin | JSON object with `title` and `accessLevel`. Modifies metadata only. |
| `POST /api/vault/documents/:id/archive` | Admin | Archives the document. The stored bytes are not deleted. |
| `GET /api/documents` | Signed-in user | Only clean, non-archived metadata the account can read. |

Use `public`, `employee`, or `confidential` for `accessLevel`. Here public means
available to all **signed-in** roles, not anonymous internet access. The existing
Intern/Employee/Admin access ladder determines who can see each tier. Responses
contain a `document` or `documents` key with metadata, never file bytes.

A new file is always stored as `pending_scan`. The extension, MIME declaration
and basic header validation are upload checks, not malware scanning. This
milestone has no scan-release route, raw file download, text extraction, or RAG
indexing. Pending files will not appear in the signed-in document list, even
for an Admin. They are visible in the separate Admin Vault list.

## Optional live Gemini provider

The default demo, local-account login, and `npm run start:postgres` still use the
local answer provider and do not need an API key.

1. Create a Gemini API key in Google AI Studio and keep it private.
2. Run `npm run gemini:check` to verify the key and configured model using only
   the fictional **public office-hours** record. The command prompts for the key
   without echoing it. It does not require PostgreSQL or a running server.
3. To enable Gemini in PostgreSQL-backed chat, stop any previous backend and run
   `npm run start:gemini`. Enter the database password, followed by the Gemini
   API key. Alternatively, supply the key in the server's `GEMINI_API_KEY`
   environment variable. Never store it in frontend configuration or Git.
   `TRUSTGATE_GEMINI_MODEL` optionally overrides the default
   `gemini-3.5-flash-lite`.

The backend still authorizes each request and writes the audit decision before
calling an answer provider. Only the approved fictional office-hours, deadline,
or budget record and a derived language label go to Gemini. Raw question text,
user identity, cookies, demo passcodes, and Vault documents stay local.
Gemini mode is intentionally not Vault retrieval/RAG. The chat API still has
the same source field and handles one supported topic per question. Provider
failures return the existing generic `502 ANSWER_UNAVAILABLE`.
