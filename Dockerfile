FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ENV VITE_API_BASE_URL=/ VITE_TRUSTGATE_JUDGE_DEMO=1
RUN npm run build

# Scan the bundled fictional PDF at build time, when the service is not
# restricted to its small runtime memory budget. A failed scan fails the build.
FROM clamav/clamav:1.4-debian13-slim AS fixture-scan
COPY deploy/judge/veloria-confidential-demo.pdf /fixture/veloria-confidential-demo.pdf
RUN clamscan --no-summary /fixture/veloria-confidential-demo.pdf

FROM python:3.12-slim-bookworm AS fixture-extract
WORKDIR /fixture
COPY --from=fixture-scan /fixture/veloria-confidential-demo.pdf ./
COPY security-engine/extract_vault.py /extract_vault.py
COPY security-engine/requirements-vault.txt /requirements-vault.txt
RUN pip install --no-cache-dir -r /requirements-vault.txt \
    && python /extract_vault.py veloria-confidential-demo.pdf application/pdf > veloria-extracted.json

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY TrustGate-backend/package*.json ./TrustGate-backend/
RUN npm ci --omit=dev --prefix TrustGate-backend
COPY TrustGate-backend/src ./TrustGate-backend/src
COPY TrustGate-backend/data ./TrustGate-backend/data
COPY security-engine/scan_cli.py ./security-engine/
COPY security-engine/security ./security-engine/security
COPY --from=frontend /build/dist ./frontend/dist
COPY --from=fixture-extract /fixture ./deploy/judge/
USER node
ENV TRUSTGATE_JUDGE_DEMO=1 TRUSTGATE_BIND_HOST=0.0.0.0 PORT=10000 TRUSTGATE_PYTHON=/usr/bin/python3
# Use the same Node runner, installed interpreter and unprivileged user as production.
RUN node --input-type=module -e 'import { scanPrompt } from "./TrustGate-backend/src/scanner.js"; const result = await scanPrompt("Hello team"); if (result.decision !== "ALLOW") throw new Error("Prompt scanner smoke test failed"); console.log("Prompt scanner is ready");'
CMD ["node", "TrustGate-backend/src/index.js", "--postgres", "--integrated"]
