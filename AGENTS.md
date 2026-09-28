# AGENTS.md

Personal portfolio and blog for Damian Bednarczyk, built with Astro and deployed to bednarczyk.xyz.

## Commands

```bash
bun run dev      # start dev server (localhost:4321)
bun run build    # production build
bun run preview  # preview production build
```

## Project Structure

```
src/
  pages/         # file-based routes
    index.astro  # homepage with projects list
    blog.astro   # blog listing
    blog/[...slug].astro  # individual blog posts
    404.astro    # custom not-found page
    api/upvote/[slug].ts  # on-demand upvote endpoint
    rss.xml.ts   # RSS feed
  content/
    blog/        # markdown blog posts
  components/    # reusable Astro components
  layouts/       # page layouts
  lib/           # upvote identity helpers
  integrations/  # build-time Astro integrations
  styles/        # global CSS
  content.config.ts  # blog collection schema
```

## Blog Posts

Blog posts live in `src/content/blog/` as `.md` files. Each post requires this frontmatter:

```markdown
---
title: string
pubDate: date (YYYY-MM-DD)
description: string
---
```

Routes come from the file name. If you move the blog directory or change the
glob pattern, edit `src/blog-source.ts`: the content collection and the
build-time slug export both read it from there.

## Upvotes

`src/components/Upvote.astro` renders the button; `src/pages/api/upvote/[slug].ts`
is the endpoint, the only on-demand route in the site. It is served by the built
Worker, so `astro dev` alone will not provide it. Use `bun run dev:worker`.

Visitors are identified by a signed, HttpOnly, opaque cookie the server mints.
Nothing is derived from IP, device, or browser.

## Tech Stack

- **Astro 7** with the `@astrojs/cloudflare` adapter, deployed to Cloudflare
  Workers with static assets
- **@astrojs/rss** — RSS feed
- **@astrojs/sitemap** — sitemap generation
- **Shiki** — syntax highlighting (github-light / github-dark themes)
- **D1** — upvote counts and deduplication records
- No UI framework — plain Astro components only

See README.md for the full setup, deployment, and verification instructions.
