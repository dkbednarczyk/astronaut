/**
 * Where blog posts live and which files count as posts.
 *
 * Shared between the content collection (src/content.config.ts) and the
 * post-slugs integration so the two cannot drift apart. If you move the blog
 * or change the file pattern, this is the only place to edit.
 */
export const BLOG_BASE = "./src/content/blog";
export const BLOG_PATTERN = "**/*.md";
