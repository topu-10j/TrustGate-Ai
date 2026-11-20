const endpoint = "https://slack.com/api/conversations.history";

export async function readSlackMessages({ token, channel, fetchImpl = globalThis.fetch }) {
  if (typeof channel !== "string" || !/^[CG][A-Z0-9]{8,30}$/.test(channel)) {
    throw new Error("Enter a Slack channel ID, not a URL.");
  }
  if (typeof token !== "string" || !/^xoxb-[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Enter a Slack bot token.");
  }
  const url = new URL(endpoint);
  url.searchParams.set("channel", channel);
  url.searchParams.set("limit", "15");
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Authorization: "Bearer " + token },
      redirect: "error",
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new Error("Could not reach Slack.");
  }
  if (response.status === 429) throw new Error("Slack rate limit reached. Try again later.");
  if (!response.ok) throw new Error("Slack could not read that channel.");
  const body = await response.json().catch(() => null);
  if (body?.ok !== true || !Array.isArray(body.messages)) {
    throw new Error("Slack could not read that channel. Check the bot's membership and history scope.");
  }
  return body.messages.slice(0, 15).flatMap((record) => {
    if (record?.type !== "message" || record.subtype || typeof record.text !== "string" ||
        !/^\d{9,12}\.\d{6}$/.test(record.ts ?? "")) return [];
    const text = record.text.replace(/\0/g, "").trim().slice(0, 48000);
    if (!text) return [];
    return [{ sourceKey: channel + ":" + record.ts, title: "Slack " + channel + " · " + record.ts, text }];
  });
}
