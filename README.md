# TrustGate AI

TrustGate is a role-based company assistant demo. The backend checks access
before passing any company record to the answer provider.

## Project status

- Backend access gate: verified locally with 14 passing tests.
- Web chat UI: pending integration.
- Live AI provider: pending. The current demo uses fictional data and a local answer function.

## Try the backend demo

Open a terminal in `TrustGate-backend` and run `npm.cmd start`.
In a second terminal in the same folder, run `npm.cmd run demo`.

An Intern can ask for office hours, but gets `403 ACCESS_DENIED` for the
confidential budget. An Admin can ask the same budget question and get an answer.

See the [backend README](TrustGate-backend/README.md) for setup and the API contract.
