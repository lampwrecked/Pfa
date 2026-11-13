# PUBLIC FACING (publicfacing.art)

500 portraits. 99 sources. Mint Wednesday, December 9, 2026.

Social: @publicfacingart (formal, placard voice) and @lampwrecked_ (personal voice).

## Look

"Wall": bone paper `#EFECE5`, ink `#1A1A18` (also the accent, no cyan), Cormorant Garamond. The wordmark is always set PUBLIC FACING in capitals, widely spaced. Use the near-black "Vault" variant only for video.

## Structure

```
index.html            Home: full-width eye strip, wordmark, dates, email signup
api/subscribe.js      Email signup, writes to Upstash Redis (same list as the preview site)
assets/eye-strip-72-full.jpg Full-width eye strip on the home page (2160x300, from composite 72, black corner kept)
```

## Reveal rule

The site reveals on the same schedule as the posts, starting obscure. Only the home page exists for now.

The hamburger menu was removed on Nov 12. It listed a page only once that page was announced, via an `announced` flag per page. To bring it back, restore it from commit `5acd602` (`git show 5acd602:index.html`). Planned pages, none live yet:

| Page | Purpose |
| --- | --- |
| `/allowlist/` | Wallet checker and pass card showing the phase |
| `/sources/` | Catalogue cards for the 99 sources, black until images are filled in |
| `/essays/` | Weekly articles, Public Facing and Lamp bylines |
| `/mint/` | Dormant until December 9, links to the OpenSea drop |

## Before the first deploy

- Confirm the eye in `assets/eye-strip-72-full.jpg` (Van Gogh, 1887, per token 72) is on your approved list of 99 sources.
- In Vercel, add the env vars `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (same database as the preview site).
- Connect this repo to a Vercel project and check the preview URL before pointing publicfacing.art (registered at Spaceship) at it.

## Mint phases (December 9, Eastern)

I. Guaranteed allowlist. II. First come, first served allowlist. III. Public. $20 per piece, paid in ETH. Exact times to be set.

## Allowlist

Built but not announced: nothing links to it yet.

```
allowlist/index.html        Public checker. Enter a wallet or ENS name, get a pass card showing the phase. Never shows the wallet or its community.
allowlist/admin/index.html  Password-gated admin: communities, paste wallets, OpenSea CSV downloads
api/allowlist/check.js      GET ?q=<address or ENS>  ->  { phase: "I" | "II" | null }
api/allowlist/admin.js      Admin actions (needs the x-admin-password header)
api/_lib/allowlist.js       Shared rules (files in api/_lib are not routes)
```

**How a wallet gets its phase.** Every wallet records which sources added it and at which tier.

| Source | Tier | Cap |
| --- | --- | --- |
| Each partner community | Guaranteed or first come | 10 guaranteed per community (editable per community) |
| Email list | Always guaranteed | none |
| Lamp | Always guaranteed | none |
| Invited by Lamp | Always guaranteed | none |

- Any guaranteed source puts the wallet in **Phase I**, and it also goes into Phase II.
- Only first-come sources put it in **Phase II**.
- Everyone else is **Phase III** (public).

A wallet can come from more than one source; the best tier wins. Removing a community takes its wallets off unless another source also added them.

**For OpenSea.** The admin page downloads one CSV per stage, in OpenSea's format (one checksummed address per line, no header, no duplicates). Stage I = Phase I wallets. Stage II = every wallet on the list, because OpenSea only lets a wallet mint in a stage if it is in that stage's file. Upload them before minting starts; OpenSea locks allowlists once minting begins. OpenSea allowlists are additive by default, so a Phase I wallet's unused mints roll into Phase II; set the per-wallet limits in OpenSea with that in mind.

**Phase times.** Fill in the `PHASES` times near the bottom of `allowlist/index.html` once they're set. Until then the pass card says "To be announced".

**Vercel env vars to add.**

- `ALLOWLIST_ADMIN_PASSWORD`: the admin password, at least 8 characters. The admin page refuses to work without it.
- `ETH_RPC_URL` (optional): an Ethereum mainnet RPC for ENS lookups. Defaults to the free publicnode endpoint.

The list lives in the same Upstash database as the email signups, under `pf:al:entries` and `pf:al:communities`, so no wallet addresses sit in this public repo.

## Swapping the home image

`vercel.json` caches images for a year, so a changed image must get a new filename (for example `eye-strip-73.jpg`), then update the `src` in `index.html`. Re-using the same name keeps serving the old one from browser and CDN caches.
