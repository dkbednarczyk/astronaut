# Damian Bednarczyk

Personal portfolio and blog for [bednarczyk.xyz](https://bednarczyk.xyz), built with Astro.

## Stack

- Astro 7 static site generation
- Astro Content Collections for Markdown blog posts
- `@astrojs/rss` for `/rss.xml`
- `@astrojs/sitemap` for sitemap generation
- Plain Astro components and global CSS

## Commands

Use Bun; the repository is pinned through `packageManager` in `package.json`.

| Command | Action |
| :-- | :-- |
| `bun install` | Install dependencies |
| `bun run dev` | Start the local Astro dev server |
| `bun run build` | Build the production site to `dist/` |
| `bun run preview` | Preview the built site locally |
| `bun run astro ...` | Run Astro CLI commands |

## Project structure

```text
src/
  pages/
    index.astro          # Homepage and project list
    blog.astro           # Blog index
    blog/[...slug].astro # Individual blog posts
    rss.xml.ts           # RSS feed
  content/blog/          # Markdown blog posts
  components/            # Shared Astro components
  layouts/               # Page shell and SEO metadata
  styles/                # Global CSS
public/                  # Static files, icons, PDFs, robots.txt
```

## Blog posts

Blog posts live in `src/content/blog/` as Markdown files. Each post needs this frontmatter:

```markdown
---
title: "Post title"
description: "Short summary for previews and RSS"
pubDate: YYYY-MM-DD
---
```

Routes are generated from the Markdown file name, so `src/content/blog/example.md` becomes `/blog/example/`.
