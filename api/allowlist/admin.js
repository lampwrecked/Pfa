// POST /api/allowlist/admin   (header  x-admin-password: <ALLOWLIST_ADMIN_PASSWORD>)
//
// Body is { action, ... }:
//   state                                              everything, for the admin page
//   upsertCommunity { name, slug?, cap? }              add or rename a community, set its guaranteed cap
//   deleteCommunity { slug }                           remove a community and its wallets
//   addWallets      { source, tier, wallets, label? }  paste addresses / ENS names (any separators)
//   removeWallet    { address, source? }               drop one source from a wallet, or the whole wallet
//   export          { phase: "I" | "II" }              OpenSea stage CSV

import { timingSafeEqual } from "node:crypto";
import {
  ENTRIES, COMMUNITIES, FIXED_SOURCES, TIERS, DEFAULT_CAP,
  getRedis, getAllEntries, getCommunities, getEntry,
  guaranteedCounts, phaseOf, resolveWallet, slugify, stageCsv,
} from "../_lib/allowlist.js";

function authorized(req) {
  const want = process.env.ALLOWLIST_ADMIN_PASSWORD || "";
  const got = String(req.headers["x-admin-password"] || "");
  if (want.length < 8) return false; // refuse to run with no or a trivial password
  const a = Buffer.from(want), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function state() {
  const [entries, communities] = await Promise.all([getAllEntries(), getCommunities()]);
  const counts = guaranteedCounts(entries);
  const list = Object.entries(entries).map(([address, e]) => ({
    address, phase: phaseOf(e), sources: e.sources, label: e.label || "", added: e.added || 0,
  })).sort((a, b) => b.added - a.added);
  const totals = { I: 0, II: list.length };
  for (const w of list) if (w.phase === "I") totals.I++;
  return { communities, fixedSources: FIXED_SOURCES, counts, wallets: list, totals };
}

function sourceInfo(source, communities) {
  if (FIXED_SOURCES[source]) return { kind: "fixed", cap: Infinity };
  if (communities[source]) return { kind: "community", cap: communities[source].cap ?? DEFAULT_CAP };
  return null;
}

async function addWallets(body) {
  const r = getRedis();
  const communities = await getCommunities();
  const source = String(body.source || "");
  const info = sourceInfo(source, communities);
  if (!info) return { status: 400, json: { error: "Unknown source." } };

  const tier = info.kind === "fixed" ? FIXED_SOURCES[source].tier : String(body.tier || "");
  if (!TIERS.includes(tier)) return { status: 400, json: { error: "Tier must be guaranteed or fcfs." } };

  const tokens = [...new Set(String(body.wallets || "").split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];
  if (!tokens.length) return { status: 400, json: { error: "Paste at least one wallet." } };
  if (tokens.length > 2000) return { status: 400, json: { error: "Paste 2,000 or fewer at a time." } };

  // Resolve, a few at a time so ENS lookups don't hammer the RPC.
  const resolved = [];
  for (let i = 0; i < tokens.length; i += 8) {
    const chunk = tokens.slice(i, i + 8);
    const out = await Promise.all(chunk.map(resolveWallet));
    out.forEach((o, j) => resolved.push({ input: chunk[j], ...o }));
  }

  const entries = await getAllEntries();
  let guaranteedUsed = guaranteedCounts(entries)[source] || 0;
  const label = String(body.label || "").slice(0, 80);
  const report = { added: [], updated: [], unchanged: [], overCap: [], failed: [] };
  const seen = new Set();

  for (const w of resolved) {
    if (w.error) { report.failed.push({ input: w.input, reason: w.error }); continue; }
    const key = w.address.toLowerCase();
    if (seen.has(key)) { report.unchanged.push(w.input); continue; }
    seen.add(key);

    const existing = entries[key];
    const prevTier = existing?.sources?.[source];
    if (prevTier === tier) { report.unchanged.push(w.input); continue; }

    if (tier === "guaranteed" && guaranteedUsed >= info.cap) {
      report.overCap.push(w.input);
      continue;
    }
    if (tier === "guaranteed") guaranteedUsed++;
    if (prevTier === "guaranteed" && tier !== "guaranteed") guaranteedUsed--;

    const entry = existing || { sources: {}, added: Date.now() };
    entry.sources = { ...entry.sources, [source]: tier };
    if (label && !entry.label) entry.label = label;
    if (w.ens && !entry.label) entry.label = w.ens;
    entries[key] = entry;
    await r.hset(ENTRIES, { [key]: JSON.stringify(entry) });
    (existing ? report.updated : report.added).push(w.input);
  }

  return { status: 200, json: { report, ...(await state()) } };
}

async function removeWallet(body) {
  const r = getRedis();
  const key = String(body.address || "").toLowerCase();
  const entry = await getEntry(key);
  if (!entry) return { status: 404, json: { error: "Not on the list." } };
  if (body.source) {
    delete entry.sources[body.source];
    if (Object.keys(entry.sources).length) await r.hset(ENTRIES, { [key]: JSON.stringify(entry) });
    else await r.hdel(ENTRIES, key);
  } else {
    await r.hdel(ENTRIES, key);
  }
  return { status: 200, json: await state() };
}

async function upsertCommunity(body) {
  const name = String(body.name || "").trim().slice(0, 80);
  const slug = slugify(body.slug || name);
  if (!name || !slug) return { status: 400, json: { error: "Community needs a name." } };
  if (FIXED_SOURCES[slug]) return { status: 400, json: { error: "That name is reserved." } };
  const cap = body.cap === undefined || body.cap === "" ? DEFAULT_CAP : Number(body.cap);
  if (!Number.isInteger(cap) || cap < 0 || cap > 1000) return { status: 400, json: { error: "Cap must be a whole number." } };
  await getRedis().hset(COMMUNITIES, { [slug]: JSON.stringify({ name, cap }) });
  return { status: 200, json: await state() };
}

async function deleteCommunity(body) {
  const r = getRedis();
  const slug = String(body.slug || "");
  if (!slug) return { status: 400, json: { error: "Missing community." } };
  const entries = await getAllEntries();
  for (const [key, e] of Object.entries(entries)) {
    if (!e.sources?.[slug]) continue;
    delete e.sources[slug];
    if (Object.keys(e.sources).length) await r.hset(ENTRIES, { [key]: JSON.stringify(e) });
    else await r.hdel(ENTRIES, key);
  }
  await r.hdel(COMMUNITIES, slug);
  return { status: 200, json: await state() };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "Wrong password." });

  try {
    const body = req.body ?? {};
    let out;
    switch (body.action) {
      case "state": out = { status: 200, json: await state() }; break;
      case "addWallets": out = await addWallets(body); break;
      case "removeWallet": out = await removeWallet(body); break;
      case "upsertCommunity": out = await upsertCommunity(body); break;
      case "deleteCommunity": out = await deleteCommunity(body); break;
      case "export": {
        const phase = body.phase === "I" ? "I" : "II";
        out = { status: 200, json: { phase, csv: stageCsv(await getAllEntries(), phase) } };
        break;
      }
      default: out = { status: 400, json: { error: "Unknown action." } };
    }
    return res.status(out.status).json(out.json);
  } catch (err) {
    console.error("allowlist admin error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
