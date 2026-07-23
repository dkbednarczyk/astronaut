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
    rss.xml.ts   # RSS feed
  content/
    blog/        # markdown blog posts
  components/    # reusable Astro components
  layouts/       # page layouts
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

## Tech Stack

- **Astro 6** — static site generator
- **@astrojs/rss** — RSS feed
- **@astrojs/sitemap** — sitemap generation
- **Shiki** — syntax highlighting (github-light / github-dark themes)
- No UI framework — plain Astro components only
