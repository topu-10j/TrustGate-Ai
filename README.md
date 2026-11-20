# TrustGate AI

TrustGate is a local demo of role-based company chat, document access, and
prompt inspection. This branch includes both real account login backed by
PostgreSQL and the original no-sign-in role-picker demo.

## Integrated backend on Windows

Use Node.js 22+, Python 3.12+, and PostgreSQL. From the repository root:

1. Create the local PostgreSQL database and account role described in the
   [PostgreSQL setup guide](TrustGate-backend/README.md#postgresql-account-login).
2. Run `npm.cmd --prefix TrustGate-backend ci`. On a new database, run
   `npm.cmd --prefix TrustGate-backend run postgres:setup` to seed the three
   demo login accounts. Skip this if they are already set up.
3. Run `npm.cmd --prefix TrustGate-backend run start:integrated-local` and use
   the `trustgate_app` database password at the prompt. The server runs on
   `http://127.0.0.1:3000`. This mode needs no API key. It has account login,
   local Vault retrieval, inline chat guard, Admin audit, incidents, and live
   alerts.
4. To process uploaded files, follow the [Vault worker setup](TrustGate-backend/README.md#vault-processing-and-knowledge-retrieval).
   A newly uploaded file is not available in chat until it is scanned and indexed.

The original role-picker UI uses the legacy backend below. The real-login UI
must use cookies and the integrated API instead. When running an integrated UI
on Vite, use `http://127.0.0.1:5173` so both ports use the same hostname.
Optional cloud modes are described in the backend guide. Use fictional or
explicitly approved data for cloud use.

## Original role-picker demo on Windows

This mode has no real login, PostgreSQL, Vault, or inline chat guard. The role
picker is for the demo, not identity verification. The separate Prompt Scanner
screen can still use Python. From the repo root, in the first terminal:

    cd TrustGate-backend
    npm.cmd start

If Windows has the Python launcher but not a working python command, in the
backend terminal set the interpreter before starting Node:

    $env:TRUSTGATE_PYTHON = (py -3 -c "import sys; print(sys.executable)").Trim()
    npm.cmd start

Keep Node running. Open a second terminal at the repo root:

    cd frontend
    npm.cmd ci
    npm.cmd run dev

Open http://127.0.0.1:5173. No API key or .env file is needed. On macOS/Linux
use npm in place of npm.cmd, and the scanner uses python3 by default.
The backend and frontend use ports 3000 and 5173. Stop any earlier copy before
starting this one.

## Original demo rehearsal

1. From the Dashboard, open Secure Chat. Stay in Intern. Try office hours, then the budget question.
   Expect a public answer and then red Access Denied.
2. Switch to Admin and try the same budget question. Expect a fictional budget
   answer, plus Intern Denied and Admin Allowed in Recent Decisions.
3. Open Firewall Logs to see Admin Allowed and Intern Denied. Search or filter the real rows and export the filtered
   results. Dashboard and Analytics show counts and charts from those rows.
4. Open Prompt Scanner. Try "Contact demo@example.com". Expect the email to be
   detected and masked. Try a regular greeting to see a low-risk result.
5. Return to Secure Chat and switch to Intern. The previous Admin chat and
   Admin-only audit data should no longer be visible.

See the [backend API contract](TrustGate-backend/README.md),
[frontend setup](frontend/README.md), and [Python engine](security-engine/README.md).
