const MAX_STREAMS_PER_PROCESS = 15;
let active = 0;

export function streamAlerts(req, res, knowledge, stillAuthorized) {
  if (active >= MAX_STREAMS_PER_PROCESS) return false;
  let cursor = /^\d{1,18}$/.test(req.headers["last-event-id"] ?? "") ? req.headers["last-event-id"] : "0";
  let reading = false;
  let closed = false;
  active++;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no"
  });
  res.write(": connected\n\n");

  async function poll() {
    if (closed || reading) return;
    if (!stillAuthorized()) return res.end();
    reading = true;
    try {
      const events = await knowledge.listIncidents(cursor);
      if (closed || !stillAuthorized()) return res.end();
      for (const event of events) {
        cursor = event.id;
        if (!res.write(`id: ${event.id}\nevent: incident\ndata: ${JSON.stringify(event)}\n\n`)) return res.end();
      }
      if (!events.length && !res.write(": heartbeat\n\n")) res.end();
    } catch {
      res.end();
    } finally {
      reading = false;
    }
  }

  const interval = setInterval(() => { void poll(); }, 3000);
  res.once("close", () => {
    closed = true;
    active--;
    clearInterval(interval);
  });
  void poll();
  return true;
}
