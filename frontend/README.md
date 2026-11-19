# TrustGate – AI Security Platform (Frontend)

React + Vite frontend for the TrustGate AI security platform. The existing dark / lime theme and dark/light themes are retained.

## Requirements
- Node.js 18.18+ (Node 20 LTS recommended)
- npm 9+

## Run on Windows (PowerShell)
```bash
cd .\frontend
npm install
Copy-Item .env.example .env
npm run dev
```
Open the URL printed by Vite (normally http://localhost:5173).

## Production build
```bash
npm run build
npm run preview
```

## Stage 1 finalization
- Existing pages, sidebar navigation and responsive shell retained.
- Dark/light theme preference persists in localStorage.
- Responsive mobile sidebar and horizontally scrollable data tables.
- Vite production build is the verification command: `npm run build`.

## Frontend functionality
- Prompt Scanner sends prompts to the backend and displays its risk score, risk level, threat type, decision and masked prompt.
- Secure Chat sends messages to the backend, shows conversation history and never displays the backend reply when the request is blocked.
- Firewall Logs loads scan and threat events from the backend and supports search, filters, refresh and CSV export.
- Dashboard loads request statistics from `/api/security/stats` and charts risk and event activity from `/api/security/events`.
- Loading and API error states are shown. No local or simulated security result is substituted when the backend is unavailable.

## Backend API contract
Base URL: `VITE_API_BASE_URL` (default `http://localhost:8000`)

- `POST /api/security/scan` body: `{ "prompt": "..." }`
- `POST /api/ai/chat` body: `{ "message": "..." }`
- `GET /api/security/stats`
- `GET /api/security/events`

Expected scan fields: `risk_score`, `risk_level`, `threats`, `decision`, `masked_prompt`.
Expected chat fields: `reply`, `decision`, `risk_score`, `risk_level` (optional `threats`).

## Project structure
```text
src/
  components/   shared layout, navigation and UI components
  pages/        Dashboard, Live Monitor, Secure Chat, Logs, Analytics, Settings
  services/     Axios API client
  App.jsx       routes and theme state
  main.jsx      React entry point
  index.css     theme tokens, layout and responsive styles
```


## Backend integration

### Frontend integration behavior
- The top bar checks `GET /api/security/stats` at startup and every 20 seconds and shows API Connected or API Offline.
- Settings includes a manual backend connection test.
- Axios uses the agreed routes: `POST /api/security/scan`, `POST /api/ai/chat`, `GET /api/security/stats`, `GET /api/security/events`.
- The frontend requires the backend and surfaces connection errors instead of showing fabricated scan results or chat replies.

### Backend requirements for Member 1
1. Enable CORS for the Vite origin `http://localhost:5173` (and the deployed frontend origin).
2. Keep provider API keys on the backend only; never add secrets to `VITE_*` variables.
3. Return JSON from the four routes above. `/api/security/stats` should return an object; `/api/security/events` may return an array or `{ "events": [] }`.
4. For `/api/security/scan`, accept `{ "prompt": "..." }` and return `risk_score`, `risk_level`, `threats`, `decision`, `masked_prompt`.
5. For `/api/ai/chat`, accept `{ "message": "..." }` and return `reply`, `decision`, `risk_score`, `risk_level` (and optionally `threats`).

### Start the backend and frontend
1. Start Member 1's backend on `http://localhost:8000`.
2. Ensure backend CORS permits `http://localhost:5173`.
3. In the frontend directory, set `VITE_API_BASE_URL=http://localhost:8000` in `.env`.
4. Run `npm run dev` and open `http://localhost:5173`.

### Local release checklist
```bash
npm install
npm run build
npm run preview
```
Open the preview URL printed by Vite. Verify all routes, theme toggle, scan, chat, log search/filter/export, and API status. The API status indicator verifies only that the stats endpoint responds; it is not a full backend health/security audit.

### Deployment configuration
Set `VITE_API_BASE_URL` to the deployed backend URL for the production build. Rebuild after changing Vite environment variables. Configure backend CORS for the deployed frontend domain.
