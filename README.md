# Damian Bednarczyk

Personal portfolio and blog for [bednarczyk.xyz](https://bednarczyk.xyz), built
with Astro and deployed to Cloudflare Workers.

## Development

```bash
bun install
bunx wrangler d1 migrations apply upvotes --local
echo "SALT=dev" > .dev.vars
bun run dev
```

## Deployment

Workers Builds deploys `master` on every push (`bun run build`, then
`npx wrangler deploy`).

The upvote endpoint needs the D1 migrations applied and a `SALT` secret. Losing
the salt lets everyone who already voted vote again.

```bash
bunx wrangler d1 migrations apply upvotes --remote
openssl rand -hex 32 | bunx wrangler secret put SALT
```
