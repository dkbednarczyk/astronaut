# Damian Bednarczyk

Personal portfolio and blog for [bednarczyk.xyz](https://bednarczyk.xyz), built
with Astro and deployed to Cloudflare Workers.

## Stack

- **Astro 7** with the `@astrojs/cloudflare` adapter
- **Cloudflare Workers** with static assets, D1, and Workers Builds
- **Bun** as the package manager and script runner
- **@astrojs/rss** for `/rss.xml`, **@astrojs/sitemap** for the sitemap
- **Shiki** for syntax highlighting, **KaTeX** for math
- No UI framework — plain Astro components only

## Commands

| Command | Action |
| :-- | :-- |
| `bun install` | Install dependencies |
| `bun run dev` | Astro dev server (localhost:4321) |
| `bun run build` | Production build to `dist/client` and `dist/server` |
| `bun run dev:worker` | Run the built Worker locally with the real runtime (localhost:8787) |
| `bun run preview` | Preview the production build |
| `bun run lint` | Biome check |
| `bun run lint:fix` | Biome check with autofix |
| `bun run test:crypto` | Upvote identity crypto checks |
| `bunx wrangler deploy` | Deploy the Worker manually |
| `bunx wrangler types` | Regenerate `worker-configuration.d.ts` |

## Project structure

```text
src/
  pages/            # file-based routes
    index.astro     # homepage with projects list
    blog.astro      # blog listing
    blog/[...slug].astro  # individual blog posts, renders the upvote button
    404.astro       # custom not-found page
    api/upvote/[slug].ts  # on-demand upvote endpoint (GET, POST, OPTIONS)
    rss.xml.ts      # RSS feed
  content/blog/     # markdown blog posts
  components/       # reusable Astro components, including Upvote.astro
  layouts/          # page layouts
  lib/              # upvote identity helpers
  integrations/     # build-time Astro integrations
  styles/           # global CSS
  content.config.ts # blog collection schema
  blog-source.ts    # blog glob pattern, shared by the collection and integration
wrangler.jsonc      # Worker config: entrypoint, assets, D1 binding
migrations/         # D1 schema migrations
migration/          # verification and maintenance scripts
```

## Blog posts

Posts live in `src/content/blog/` as `.md` files. Each needs this frontmatter:

```markdown
---
title: string
pubDate: date (YYYY-MM-DD)
description: string
---
```

Routes come from the file name, so `src/content/blog/example.md` becomes
`/blog/example/`. If you move the blog directory or change the glob pattern,
edit `src/blog-source.ts` — the content collection and the build-time slug
export both read the pattern from there, so they cannot drift apart.

## Upvotes

Each post has an upvote button. `src/components/Upvote.astro` renders a real
`<button>` with `aria-pressed` and a visually hidden status line, so it is
keyboard and screen reader accessible. The count loads on page view; if the API
is unreachable the button shows an en dash and stays disabled, leaving the post
itself readable.

The button only appears on individual post pages, not on the blog listing, so
opening `/blog/` makes no API calls.

### How a visitor is identified

By an opaque random ID the server mints and stores in a signed HttpOnly cookie.
Nothing is derived from their IP address, device, or browser — no IP, no
User-Agent, no TLS fingerprint. The server remembers only a number it invented,
so readers sharing an address can each vote.

The cookie is signed with the `SALT` secret. Without the signature anyone could
mint their own IDs and vote without limit. Only a SHA-256 of the ID reaches the
database, so a dump cannot be replayed as working cookies.

**Clearing cookies grants a fresh vote.** That is the deliberate cost of not
fingerprinting anyone.

### Slug validation

`src/integrations/post-slugs.ts` writes the real post slugs to
`src/generated/post-slugs.json` at build time, and the API route imports that
file. Only genuine posts can be voted on, so the database cannot be filled with
junk keys. The generated file is gitignored and rebuilt on every `dev` and
`build`.

### Bots

The API rejects traffic where Cloudflare has set `verifiedBotCategory` or
`botManagement.verifiedBot`. These identify known bots by reverse DNS. They
classify bots rather than fingerprinting people, so real visitors pay no
privacy cost. Unrecognised traffic is treated as human, so a real reader is
never blocked.

## Database

One D1 database, `upvotes`, holding two tables:

- `votes(slug TEXT PRIMARY KEY, count INTEGER)` — one row per post
- `voters(hash TEXT PRIMARY KEY, created_at INTEGER)` — one row per
  (identity, slug) pair, used to reject duplicate votes

### Working with counts

`migration/votes.ps1` reads, corrects, and resets counts. It always prints
current values first and prompts before changing anything.

```powershell
.\migration\votes.ps1                                       # list counts
.\migration\votes.ps1 -Action show -Slug two-knights -Remote
.\migration\votes.ps1 -Action set  -Slug two-knights -Count 3 -Remote
.\migration\votes.ps1 -Action reset -Slug two-knights -Remote   # to 0, keep voter records
.\migration\votes.ps1 -Action wipe -Remote                     # every post to 0
.\migration\votes.ps1 -Action drop -Remote                     # counts and voters, full reset
```

`reset` and `wipe` keep the voter records, so after correcting a bad count
previous voters cannot vote again. Only `drop` clears deduplication. Omit
`-Remote` to work on the local database instead of the live one.

To inspect the database directly:

```bash
npx wrangler d1 execute upvotes --remote --command "SELECT slug, count FROM votes"
```

## Deployment

Workers Builds deploys `master` on every push. Build command `bun run build`,
deploy command `npx wrangler deploy`, root directory `/`. The `wrangler.jsonc`
`name` must match the Worker name in the dashboard or builds fail.

Preview the site at `https://astronaut.dxbednarczyk.workers.dev`.

### Local development against the real runtime

```bash
bun install
bunx wrangler d1 migrations apply upvotes --local
bun run build
bun run dev:worker
```

`dev:worker` runs the Worker in Cloudflare's actual runtime rather than Node,
so D1 bindings and the API route behave as they do in production. Run
`build` first; `dev:worker` does not build for you.

Note that `astro dev` alone will not serve the upvote API. That route only
exists in the built Worker.

### Secrets

`SALT` is a secret and is not in this repo. To set it on the live Worker:

```bash
openssl rand -hex 32
npx wrangler secret put SALT --name astronaut
```

For local development, put a throwaway value in `.dev.vars`, which is
gitignored. Keep the real SALT somewhere safe: losing it does not erase vote
counts, but existing voter hashes can no longer be matched to their cookies, so
everyone who has already voted may vote again.

### Changing the D1 binding

The binding name is `DB` and is read as `env.DB` in the API route. It appears
in three places that must agree: `wrangler.jsonc`, the Worker settings in the
dashboard, and `src/pages/api/upvote/[slug].ts`.

## Verification

`migration/` holds the checks used to confirm the site after a deploy.

| Script | Checks |
| :-- | :-- |
| `check-urls.ps1` | Every URL in `url-list.txt`, with `-BaseUrl` for a preview |
| `test-upvote-api.ps1` | The API end to end: identity, dedup, forgery, slug validation |
| `test-upvote-frontend.mjs` | The bundled client script against a DOM stub |
| `test-upvote-crypto.mjs` | HMAC, base64url, and constant-time compare against RFC vectors |

```powershell
.\migration\check-urls.ps1 -BaseUrl https://astronaut.dxbednarczyk.workers.dev
powershell -File migration\test-upvote-api.ps1 -BaseUrl https://astronaut.dxbednarczyk.workers.dev
```

`test-upvote-api.ps1` and `check-urls.ps1` read the starting counts and assert
relative to them, so they are safe to run repeatedly against a live database.
`test-upvote-api.ps1` does leave real vote records behind; clean up with
`votes.ps1 -Action wipe -Remote`.

To test the frontend script, extract it from a built page first:

```powershell
$html = curl.exe -s --compressed "https://astronaut.dxbednarczyk.workers.dev/blog/two-knights/"
$i = $html.IndexOf('<script type="module">') + '<script type="module">'.Length
$j = $html.IndexOf('</script>', $i)
[IO.File]::WriteAllText("$env:TEMP\bundle.js", $html.Substring($i, $j - $i), (New-Object Text.UTF8Encoding($false)))
node --experimental-strip-types migration\test-upvote-frontend.mjs "$env:TEMP\bundle.js"
```

## Notes on the platform

The site runs on Workers, not Pages. Cloudflare's Pages documentation now
advises starting new projects on Workers, and the Astro Cloudflare adapter
dropped Pages support in v13.

Three adapter settings in `astro.config.mjs` are deliberate:

- `session: false` — no sessions here, so the adapter is told not to provision
  a KV namespace
- `imageService: "compile"` — the images are prerendered SVGs, which the
  Cloudflare Images binding rejects
- `prerenderEnvironment: "node"` — every page is prerendered and needs no
  Workers APIs, and the workerd prerenderer fails during teardown

## Line endings

`.gitattributes` normalises everything to LF. Without it, a Windows checkout
rewrites line endings and both Biome and the asset hashes disagree with CI.
