# TrustGate Frontend

The React/Vite UI ships a no-sign-in role demo for the existing TrustGate
backend. It uses fictional company records and the local answer function.

## Start

Use Node.js 22 or later. Start the backend first from TrustGate-backend:

    npm.cmd start

With the backend running, open another terminal in frontend:

    npm.cmd ci
    npm.cmd run dev

Open http://127.0.0.1:5173 for the original Dashboard. Use Secure Chat to select a demo role. Use npm rather than npm.cmd on macOS/Linux.
Start the Node backend with Python 3.12+ available if you also want Prompt Scanner.
No .env file is needed for the default backend at http://127.0.0.1:3000.
If the backend URL changes, create a frontend .env from .env.example and
restart Vite. If the frontend origin changes, set FRONTEND_ORIGIN in the
backend terminal to that exact origin and restart the backend.

## API integration

| Function | Endpoint | Behavior |
| --- | --- | --- |
| Backend status | GET /health | Shows connection status independently of permission results |
| Demo role | POST /api/demo/session | Gets a new token for the selected role and resets chat/audit UI |
| Ask a question | POST /api/chat | Shows answer on success and Access Denied on a permission block |
| Admin audit log | GET /api/audit | Uses the Admin session token, shows newest decisions first |
| Prompt scanner | POST /api/security/scan | Uses a demo token, returns risk, decision and masked text from Python |

Session tokens stay in memory. Changing role removes the prior chat and audit
panel and cancels old requests in the UI. The displayed audit rows contain only
timestamps, roles, decisions, and reason codes. A permission allow is not a
claim that a live AI provider ran.

The scanner is a separate run of the Python engine and does not change chat
permissions. Dashboard and Analytics summarize audit decisions, not scanner
risk. Firewall Logs can search, filter, and export the same audit records.
Live AI is not connected.

## Build check

    npm.cmd run build
    npm.cmd run preview

Stop the dev server before preview. Both use port 5173 by default, an origin
allowed by the local TrustGate backend. Review the Intern deny, Admin answer,
and Admin audit log against the running backend. The search placeholder and notification icon in the original header are visual controls only.
