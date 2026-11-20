# TrustGate AI integration test report

This report records validation of the integrated code at commit `eb40562`
(the merge of frontend PR #5 and the follow-up fixes). Tests ran against a
clean checkout with real local PostgreSQL and a Chromium browser, using
disposable demo accounts and documents.

## Automated checks

| Check | Result |
|---|---|
| Clean dependency install | Passed for backend and frontend |
| Backend `npm test` | 62 passed, 0 failed |
| Frontend `npm test` | 16 passed, 0 failed |
| Frontend `npm run build` | Passed |
| Security Engine `python -m pytest -q` | 87 passed, 0 failed |

The Vite build reported a bundle-size warning. It did not fail the build.

## Browser and PostgreSQL checks

| Flow | What was verified |
|---|---|
| Account login | Admin, Employee, and Intern could sign in and out. The Admin session survived a page refresh and used an HttpOnly cookie. |
| Vault and chat | An Admin upload started as pending and changed to clean after indexing. Admin received an answer with a source citation from the actual extracted PDF. Employee and Intern could not open the Admin Vault or retrieve the confidential document. |
| Scope management | Loading an account and adding a scope preserved existing memberships. A duplicate entry did not create a second scope. |
| Scanner and warnings | The Python scanner masked a fictional email. A chat response with a scanner warning displayed `WARN` instead of `ALLOW`. |
| Chat session reset | New Chat and Clear removed prior server-side context without signing out the account. The backend suite also covered an older request finishing after reset. |
| Concurrent chat | Two simultaneous HTTP requests both succeeded and returned four sources each. |
| Live alerts | An incident arrived over the live stream, and clicking it opened the matching incident by ID. |

No uncaught browser page errors were observed during these flows.

## Scope and limits

The final browser run used real PostgreSQL and PDF text extraction. It used a
test fixture for the antivirus verdict. An earlier Windows smoke test used
the real built-in Microsoft Defender scanner to process a harmless PDF and
verify that Admin could retrieve it while Intern could not.

The run used `start:integrated-local`. It does not validate public deployment
or live cloud-provider calls. The [root README](../README.md) documents how to
run the local browser demo.
