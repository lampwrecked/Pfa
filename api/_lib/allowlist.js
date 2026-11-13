// Shared allowlist logic. Files under api/_lib are not routes on Vercel.
//
// HOW THE LIST IS STRUCTURED
//
// Every wallet is one entry. An entry records which sources put it on the
// list and at which tier:
//
//   pf:al:entries      hash  address -> {"sources":{"<source>":"guaranteed"|"fcfs"}, "label":"…", "added":<ms>}
//   pf:al:communities  hash  slug    -> {"name":"…","cap":10}
//
// Sources are either a community slug (one per partner community) or one of
// the fixed sources below. The mint phase is worked out from the tiers:
//
//   Phase I  (guaranteed)        any source marked "guaranteed"
//   Phase II (first come)        every wallet on the list, so Phase I wallets
//                                are in Phase II too (OpenSea needs a wallet
//                                listed in each stage it should mint in)
//   Phase III (public)           anyone, no list
//
// Each community can mark at most `cap` wallets as guaranteed (default 10).
// The fixed sources have no cap.

import { Redis } from "@upstash/redis";
import { createPublicClient, http, getAddress, isAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

export const ENTRIES = "pf:al:entries";
export const COMMUNITIES = "pf:al:communities";

export const FIXED_SOURCES = {
  email: { name: "Email list", tier: "guaranteed" },
  lamp: { name: "Lamp", tier: "guaranteed" },
  invite: { name: "Invited by Lamp", tier: "guaranteed" },
};

export const TIERS = ["guaranteed", "fcfs"];
export const DEFAULT_CAP = 10;

let redis;
export function getRedis() {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}
// For tests only.
export function setRedis(r) { redis = r; }

let client;
function getClient() {
  if (!client) {
    client = createPublicClient({
      chain: mainnet,
      transport: http(process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com"),
    });
  }
  return client;
}
// For tests only.
export function setClient(c) { client = c; }

const ENS_RE = /^[^\s]+\.[a-z0-9-]+$/i;

// Turns "0xabc…" or "name.eth" into a checksummed address.
// Returns { address } or { error }.
export async function resolveWallet(raw) {
  const q = String(raw ?? "").trim();
  if (!q) return { error: "empty" };
  if (/^0x/i.test(q)) {
    if (!isAddress(q, { strict: false })) return { error: "invalid" };
    return { address: getAddress(q.toLowerCase()) };
  }
  if (!ENS_RE.test(q) || q.length > 255) return { error: "invalid" };
  let name;
  try { name = normalize(q); } catch { return { error: "invalid" }; }
  try {
    const address = await getClient().getEnsAddress({ name });
    if (!address) return { error: "unresolved" };
    return { address: getAddress(address), ens: name };
  } catch (err) {
    console.error("ENS lookup failed:", name, err?.shortMessage || err);
    return { error: "lookup_failed" };
  }
}

export function parseJSON(v) {
  if (v == null) return null;
  if (typeof v === "object") return v; // Upstash auto-parses JSON values
  try { return JSON.parse(v); } catch { return null; }
}

export function phaseOf(entry) {
  if (!entry || !entry.sources) return null;
  const tiers = Object.values(entry.sources);
  if (tiers.includes("guaranteed")) return "I";
  if (tiers.length) return "II";
  return null;
}

export async function getEntry(address) {
  return parseJSON(await getRedis().hget(ENTRIES, address.toLowerCase()));
}

export async function getAllEntries() {
  const raw = (await getRedis().hgetall(ENTRIES)) || {};
  const out = {};
  for (const [addr, v] of Object.entries(raw)) {
    const e = parseJSON(v);
    if (e) out[addr] = e;
  }
  return out;
}

export async function getCommunities() {
  const raw = (await getRedis().hgetall(COMMUNITIES)) || {};
  const out = {};
  for (const [slug, v] of Object.entries(raw)) {
    const c = parseJSON(v);
    if (c) out[slug] = c;
  }
  return out;
}

export function slugify(s) {
  return String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// Counts guaranteed wallets per source.
export function guaranteedCounts(entries) {
  const counts = {};
  for (const e of Object.values(entries)) {
    for (const [src, tier] of Object.entries(e.sources || {})) {
      if (tier === "guaranteed") counts[src] = (counts[src] || 0) + 1;
    }
  }
  return counts;
}

// OpenSea stage CSV: one checksummed address per line, no header, no duplicates.
export function stageCsv(entries, phase) {
  const rows = [];
  for (const [addr, e] of Object.entries(entries)) {
    const p = phaseOf(e);
    if (!p) continue;
    if (phase === "I" && p !== "I") continue;
    rows.push(getAddress(addr));
  }
  rows.sort();
  return rows.join("\n") + (rows.length ? "\n" : "");
}
