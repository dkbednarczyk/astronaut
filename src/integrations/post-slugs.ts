import { mkdir, writeFile } from "node:fs/promises";
import type { AstroIntegration } from "astro";
import { glob } from "tinyglobby";
import { BLOG_BASE, BLOG_PATTERN } from "../blog-source";

const OUTPUT_DIR = new URL("../generated/", import.meta.url);

// Writes the real post slugs to src/generated/post-slugs.json so the upvote
// API only accepts votes for posts that exist.
export function postSlugs(): AstroIntegration {
  return {
    name: "post-slugs",
    hooks: {
      "astro:config:setup": async () => {
        const files = await glob(BLOG_PATTERN, { cwd: BLOG_BASE });
        const slugs = files.map((file) => file.replace(/\.md$/, "")).sort();

        await mkdir(OUTPUT_DIR, { recursive: true });
        await writeFile(
          new URL("post-slugs.json", OUTPUT_DIR),
          JSON.stringify(slugs),
        );
      },
    },
  };
}
