# PUBLIC FACING (publicfacing.art)

500 portraits. 99 sources. Mint Wednesday, December 9, 2026. Reveal Saturday, December 12, 2026.

Social: @publicfacingart (formal, placard voice) and @lampwrecked_ (personal voice).

## Look

"Wall": bone paper `#EFECE5`, ink `#1A1A18`, one cyan accent `#6FA3B0`, Cormorant Garamond. The wordmark is always set PUBLIC FACING in capitals, widely spaced. Use the near-black "Vault" variant only for video.

## Structure

```
index.html        Home: wordmark, tight eye crop, dates, email signup, hamburger menu
api/subscribe.js  Email signup, writes to Upstash Redis (same list as the preview site)
assets/eye.jpg    The cropped eye on the home page (add this; a placeholder shows until then)
```

## Reveal rule

The site reveals on the same schedule as the posts, starting obscure. A page only gets a menu link once it is announced.

To announce a page: build it, then set `announced: true` for it in the `PAGES` list near the bottom of `index.html`. Planned pages, none live yet:

| Page | Purpose |
| --- | --- |
| `/allowlist/` | Wallet checker and pass card showing the phase |
| `/sources/` | Catalogue cards for the 99 sources, black until images are filled in |
| `/essays/` | Weekly articles, Public Facing and Lamp bylines |
| `/mint/` | Dormant until December 9, links to the OpenSea drop |

## Before the first deploy

- Add `assets/eye.jpg`: a tight crop of a single eye. If it is a Van Gogh eye, take it from a left-facing portrait on the approved list of 99 sources.
- In Vercel, add the env vars `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (same database as the preview site).
- Connect this repo to a Vercel project and check the preview URL before pointing publicfacing.art (registered at Spaceship) at it.

## Mint phases (December 9, Eastern)

I. Guaranteed allowlist. II. First come, first served allowlist. III. Public. $20 per piece, paid in ETH. Exact times to be set.
