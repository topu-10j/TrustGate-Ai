# TrustGate AI

TrustGate is a no-sign-in, local demo of role-based company chat and prompt
inspection. Its fictional data is safe for the demo. The role picker is not a
login or a claim of production access control.

- Secure Chat checks role permissions in Node and uses a local answer function.
- Admin Audit Log, Firewall Logs, Dashboard, and Analytics show actual permission
  decisions. They do not count scanner results as access decisions or threats.
- Prompt Scanner sends text to the team's Python engine through the Node server.
  The separate scan previews a decision and masked text. It does not store scan
  inputs or run automatically on Secure Chat messages.
- AI Analysis explains what the scanner checks. A live LLM provider is not connected.

## Run on Windows

Use Node.js 22+ and Python 3.12+ (Python is required only for scanning).
Open this folder in VS Code. From the repo root, in the first terminal:

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

## Final rehearsal

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
