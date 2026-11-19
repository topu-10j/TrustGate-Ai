# TrustGate AI

TrustGate is a role-based company assistant demo. The backend checks access
before passing any company record to the answer provider.

## Project status

- Backend access gate and Admin audit log: verified locally with 19 passing tests.
- Frontend dashboard, prompt scanner, secure chat and event logs: available in `frontend/`.
- Frontend-to-backend API integration: pending; the current backend demo exposes a different API contract.
- Live AI provider: pending. The current demo uses fictional data and a local answer function.

## Run the frontend

In PowerShell, from the repository root:

```powershell
cd .\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

The frontend expects `/api/security/scan`, `/api/ai/chat`,
`/api/security/stats` and `/api/security/events` at `http://localhost:8000`.
The current demo backend instead exposes `/api/demo/session`, `/api/chat` and
`/api/audit`; a compatible backend or API adapter is needed to connect them.
See [frontend setup and API details](frontend/README.md).

## Try the backend demo

Open a terminal in `TrustGate-backend` and run `npm.cmd start`.
In a second terminal in the same folder, run `npm.cmd run demo`.

An Intern can ask for office hours, but gets `403 ACCESS_DENIED` for the
confidential budget. An Admin can ask the same budget question and get an answer.
The demo also prints the most recent access decisions from the Admin audit log.

See the [backend README](TrustGate-backend/README.md) for setup and the API contract.
