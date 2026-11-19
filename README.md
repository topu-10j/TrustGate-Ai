# TrustGate AI

TrustGate is a role-based company assistant demo. The backend checks access
before passing any company record to the answer provider.

## Project status

- Backend access gate and Admin audit log: verified locally with 19 passing tests.
- Web chat UI: pending integration.
- Live AI provider: pending. The current demo uses fictional data and a local answer function.

## Try the backend demo

Open a terminal in `TrustGate-backend` and run `npm.cmd start`.
In a second terminal in the same folder, run `npm.cmd run demo`.

An Intern can ask for office hours, but gets `403 ACCESS_DENIED` for the
confidential budget. An Admin can ask the same budget question and get an answer.
The demo also prints the most recent access decisions from the Admin audit log.

See the [backend README](TrustGate-backend/README.md) for setup and the API contract.
