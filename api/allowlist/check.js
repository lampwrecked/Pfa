// GET /api/allowlist/check?q=<address or ENS name>
// Answers only with the phase. It never says which community a wallet came from
// and never lists other wallets.

import { getRedis, getEntry, phaseOf, resolveWallet } from "../_lib/allowlist.js";

const LIMIT = 30;          // lookups
const WINDOW = 60;         // per minute, per IP

async function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const key = `pf:al:rl:${ip}`;
  const r = getRedis();
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, WINDOW);
  return n > LIMIT;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    if (await rateLimited(req)) {
      return res.status(429).json({ error: "Too many lookups. Try again in a minute." });
    }

    const found = await resolveWallet(req.query?.q);
    if (found.error) {
      const msg = {
        empty: "Enter a wallet address or ENS name.",
        invalid: "That is not a wallet address or ENS name.",
        unresolved: "That ENS name does not point to a wallet.",
        lookup_failed: "Could not look up that ENS name. Try the 0x address.",
      }[found.error];
      return res.status(400).json({ error: msg });
    }

    const phase = phaseOf(await getEntry(found.address));
    return res.status(200).json({ phase });
  } catch (err) {
    console.error("allowlist check error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
