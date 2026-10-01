# AGENTS.md

Personal portfolio and blog for Damian Bednarczyk, built with Astro and deployed to bednarczyk.xyz.

## Commands

```bash
pnpm dev      # start dev server (localhost:4321)
pnpm build    # production build
pnpm preview  # preview production build
```

## Project Structure

```
src/
  pages/         # file-based routes
    index.astro  # homepage with projects list
    blog.astro   # blog listing
    blog/[...slug].astro  # individual blog posts
    music.astro  # album carousel
    404.astro    # custom not-found page
    api/upvote/[slug].ts  # on-demand upvote endpoint
    rss.xml.ts   # RSS feed
  content/
    blog/        # markdown blog posts
  components/    # reusable Astro components
  layouts/       # page layouts
  lib/           # upvote identity helpers
  styles/        # global.css (every page) + one file per section, imported by its pages
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

## Upvotes

`src/pages/api/upvote/[slug].ts` is the only on-demand route. It needs the D1
binding `DB` and the `SALT` secret (`.dev.vars` locally).

`.dev.vars` is gitignored and the local D1 starts empty, so on a fresh clone
blog posts error until you run the README's Development setup:

```bash
pnpm wrangler d1 migrations apply upvotes --local
echo "SALT=dev" > .dev.vars
```

## Tech Stack

- **Astro 7** with the `@astrojs/cloudflare` adapter, deployed to Cloudflare Workers
- **@astrojs/rss** — RSS feed
- **@astrojs/sitemap** — sitemap generation
- **Shiki** — syntax highlighting (github-dark-default theme; the site is dark-only)
- **D1** — upvote counts
- No UI framework — plain Astro components only
