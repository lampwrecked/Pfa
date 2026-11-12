import { Redis } from "@upstash/redis";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same sorted set as the preview site, so everyone on the old list carries over.
// Each member is an email, the score is its signup timestamp. Re-submitting
// the same email just updates its timestamp.
const KEY = "publicfacing:subscribers";

let redis;
function getRedis() {
  // Created inside the handler so missing env vars return a clean 500
  // instead of crashing the function at load time.
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body ?? {};
    const raw = typeof body.email === "string" ? body.email.trim() : "";

    if (!raw || raw.length > 254 || !EMAIL_RE.test(raw)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const email = raw.toLowerCase();
    const added = await getRedis().zadd(KEY, { score: Date.now(), member: email });

    return res.status(200).json({ ok: true, isNew: added === 1 });
  } catch (err) {
    console.error("subscribe error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
