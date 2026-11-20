# TrustGate AI — Real Backend Frontend Integration

This existing React/Vite frontend is wired to the cookie-session backend contract provided in the handoff. Demo role selection and bearer-token auth have been removed.

## Local development (Windows)
1. Prepare the PostgreSQL `trustgate` DB, `trustgate_app` role, and local app accounts using the backend README.
2. Start backend from repo root: `npm.cmd --prefix TrustGate-backend run start:integrated-local`.
3. In another terminal: `npm.cmd --prefix frontend ci` then `npm.cmd --prefix frontend run dev`.
4. Open **http://127.0.0.1:5173**. API defaults to **http://127.0.0.1:3000**. Keep both hostnames as `127.0.0.1`; do not mix with `localhost`. This local integrated mode does not require a Gemini key.

## Auth/session
- `POST /api/auth/login` sends only `{ email, password }`. Role comes from `user.role`; no role dropdown.
- Refresh restores session via `GET /api/auth/me` and HttpOnly cookie.
- Axios uses `withCredentials: true`; no bearer tokens or token storage.
- `POST /api/auth/logout` accepts 204 without JSON parsing. 401 clears authenticated UI.

## Endpoints integrated
| Feature | Endpoint | UI behavior |
|---|---|---|
| Login | POST `/api/auth/login` | email/password and server role |
| Restore | GET `/api/auth/me` | cookie session restore |
| Logout | POST `/api/auth/logout` | handles 204 |
| Chat | POST `/api/chat` `{message}` | `answer` and only returned `sources` |
| Scanner | POST `/api/security/scan` `{prompt}` | 401, ACCESS_DENIED, PROMPT_BLOCKED errors handled |
| Documents | GET `/api/documents` | role-filtered list for signed-in users |
| Vault list | GET `/api/vault/documents` | Admin management metadata |
| Upload | POST `/api/vault/documents` FormData `title`,`accessLevel`,`file` | PDF/DOCX/XLSX, 5 MiB max; no manual multipart header |
| Metadata | PATCH `/api/vault/documents/:id` | title/accessLevel |
| Archive | POST `/api/vault/documents/:id/archive` | archive only |
| Doc scopes | POST `/api/vault/documents/:id/scopes` | scope array |
| Account scopes | POST `/api/admin/account-scopes` | Admin form |
| Audit | GET `/api/audit` `{events}` | Admin poll 4s |
| Incidents | GET `/api/security/incidents` `{incidents}` | Admin dashboard |
| Incident status | PATCH `/api/security/incidents/:id` | acknowledged/resolved |
| Alerts | credentialed EventSource GET `/api/security/alerts` | `incident` event, dedupe, close on unmount/logout |

## Security notes
- Admin-only frontend routes: `/logs`, `/analytics`, `/vault`. Backend remains the authoritative authorization layer.
- `public` means all signed-in roles, not anonymous. Documents list is backend-filtered.
- Vault files start as `pending_scan`; refresh polls for `clean` or `rejected`. Archived metadata uses `archivedAt`.
- No scan approval, force release, or raw-download API was added.
- Never commit credentials, secrets, or local test passwords. Backend CORS must allow exact frontend origin with credentials. Use HTTPS in production and configure backend cookie security for deployment.

## Tests
From frontend: `npm.cmd test`, `npm.cmd run build`. The included unit tests cover route policy, upload validation, alert identity/state, CSV injection, and HTML escaping. E2E requires npm dependencies and a running backend.

## Branch/PR
Target PR base is `feat/real-login`, expected base commit `31e18bf`. Suggested work branch: `feature/frontend-real-backend-integration`. Do not push to `main`. This environment cannot verify GitHub's branch graph or create remote commits/PRs; once in a local clone, verify branches and run:

```bash
git status
git fetch origin
git switch -c feature/frontend-real-backend-integration 31e18bf
# if local frontend changes already exist, commit them first; then merge the backend branch as directed
git merge origin/feat/real-login
cd frontend
npm ci
npm test
npm run build
cd ..
git add frontend
git commit -m "Integrate frontend with real cookie auth backend"
git push -u origin feature/frontend-real-backend-integration
```
Create the PR with base `feat/real-login`, not `main`; reconcile commands to the verified remote branch state first.
