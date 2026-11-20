# Publish the TrustGate judging demo

This separate deployment is for fictional competition data only. It runs Vite, Node, the Python prompt scanner and PostgreSQL behind one HTTPS URL. It uses local, source-cited answers without an AI API key. The Docker build scans a bundled fictional PDF with ClamAV before extracting it. If that scan or extraction fails, the image will not build. Only that document is preloaded. Chat is interactive. Vault uploads and edits, account-scope edits and incident status changes are disabled in this shared demo. Audit and incident history remain viewable for Admin. The original laptop setup can still show the full upload → scan → index workflow.

## Publish from GitHub

1. Push these files to your repo, either with the deployment branch selected below or after merging it to main. On [Render](https://dashboard.render.com/), sign in with GitHub.
2. Choose **New → Blueprint** and connect the TrustGate repository. Select the branch containing `render.yaml` and keep the default Blueprint path.
3. Render will ask for three secret values. Set **different, randomly generated passwords** of at least 16 characters for the Admin, Employee and Intern accounts. Do not put these in GitHub. Render supplies the separate database credentials automatically. Select the free services if asked. Wait until the deployment is live.
4. Open the URL shown on the Render service page in a private browser window. Use the public HTTPS URL Render actually assigns. The first visit after idle can take about a minute. The free database expires 30 days after creation. Check that this covers the judging period.

| Account | Email |
| --- | --- |
| Admin | admin@trustgate.example |
| Employee | employee@trustgate.example |
| Intern | intern@trustgate.example |

## Check before sharing

- Sign in as Admin. In Admin Vault, verify that **Veloria Volunteer Orientation** is confidential and clean.
- Ask in Secure Chat: **Where is Veloria volunteer orientation?** Verify that the Admin answer includes **Cedar Hall** and cites the PDF.
- Repeat in a separate private window as Intern. Verify that the confidential document and citation do not appear, and the answer does not contain **Cedar Hall**.
- Share the app URL and the competition-only demo credentials with the judges through the submission channel. Do not send the PostgreSQL password. Do not submit real information to this demo.
- New file upload is intentionally not part of this preview. For an upload and scan presentation, use the original local setup, or deploy a separate Linux scanner-enabled environment with sufficient memory.

The public service uses a shared, read-only document library. Sessions are lost on service restart. To rotate the three demo passwords, update the Render environment and restart; the seed process updates password hashes and leaves the existing fixture intact.
