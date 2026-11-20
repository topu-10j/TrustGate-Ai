# TrustGate AI

TrustGate is a local demo of role-based company chat, document access, and prompt
inspection. The React frontend signs in with PostgreSQL-backed accounts.
The backend checks the signed-in account's permissions before it uses an
approved document in chat.

## Run the current demo on Windows

Install Node.js 22+, Python 3.12+, and PostgreSQL. Open the repository root in
VS Code and run these commands in PowerShell.

1. Follow the [PostgreSQL setup guide](TrustGate-backend/README.md#postgresql-account-login)
   to create the local `trustgate` database and `trustgate_app` database role if
   you have not done so already.
2. Install the backend dependencies with `npm.cmd --prefix TrustGate-backend ci`.
   For a new database, run `npm.cmd --prefix TrustGate-backend run postgres:setup`
   to create the Intern, Employee, and Admin demo accounts. Do not rerun setup
   if those accounts are already configured.
3. Start the backend. At the prompt, enter the **database** password for
   `trustgate_app`, not a TrustGate sign-in password.

   ```powershell
   npm.cmd --prefix TrustGate-backend run start:integrated-local
   ```

4. Keep the backend running. In a second terminal at the repository root:

   ```powershell
   npm.cmd --prefix frontend ci
   npm.cmd --prefix frontend run dev
   ```

5. Open [the frontend](http://127.0.0.1:5173) and sign in with one of the demo
   accounts you set up. The API runs at `http://127.0.0.1:3000`. Use `127.0.0.1` on
   both ports so browser cookies work. The integrated-local demo needs no
   Gemini or OpenAI key.

On macOS/Linux, use `npm` in place of `npm.cmd`. The scanner uses `python3`
by default there. Set `TRUSTGATE_PYTHON` to the interpreter path if needed.

## Rehearse the browser demo

1. Sign in as Admin. In **Admin Vault**, upload a harmless sample PDF as
   **confidential**. Note that it starts as **Pending scan**.
2. Follow the [Vault worker setup](TrustGate-backend/README.md#vault-processing-and-knowledge-retrieval)
   to install extraction dependencies and select a scanner. For Windows
   Defender, use a separate Administrator PowerShell at the repository root:

   ```powershell
   $env:TRUSTGATE_VAULT_SCANNER = "defender"
   npm.cmd --prefix TrustGate-backend run vault:scan
   ```

3. Once the document is **Clean**, ask about a distinct fact from it in
   **Secure Chat**. Admin should get a source citation. Try **New Chat** and
   then a generic follow-up to confirm the previous context was cleared.
4. Sign out and sign in as Intern or Employee. The confidential PDF should
   not appear in **Documents** or as a chat source. Admin-only tools should
   not be available to those roles.
5. In **Prompt Scanner**, try a fictional email such as
   `Contact demo@example.com` and check that the email is masked.

## Other backend modes

`npm start` still launches the original no-sign-in backend for the standalone
CLI demo in `TrustGate-backend`. It is **not compatible with the current
real-login frontend**. For that frontend, use `start:integrated-local`. Optional
cloud-provider modes are documented in the backend guide and are not needed
for the local demo.

See the [backend guide](TrustGate-backend/README.md),
[frontend setup](frontend/README.md),
[integration test report](frontend/TEST_REPORT.md), and
[Python engine guide](security-engine/README.md).
