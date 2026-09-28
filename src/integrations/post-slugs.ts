import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { glob } from "tinyglobby";
import { BLOG_BASE, BLOG_PATTERN } from "../blog-source";

const OUTPUT_DIR = fileURLToPath(new URL("../generated/", import.meta.url));
const OUTPUT_FILE = new URL("../generated/post-slugs.json", import.meta.url);

/**
 * Writes the list of real blog post slugs to src/generated/post-slugs.json.
 *
 * The upvote Pages Function imports that file so it only accepts slugs for
 * posts that actually exist. Without it, a crafted request could create a
 * counter row for any string, which is how a database fills with junk.
 *
 * Slugs are derived from the file paths rather than the content collection,
 * because astro:content is not importable from an integration hook. The glob
 * pattern is shared with the collection via src/blog-source.ts, so the two
 * stay in step.
 *
 * Runs on `astro dev` and `astro build`, so the file is present before
 * Cloudflare bundles the Function.
 */
export function postSlugs(): AstroIntegration {
  return {
    name: "post-slugs",
    hooks: {
      "astro:build:setup": async ({ logger }) => {
        // Mirror the glob loader: strip the base, drop the pattern, drop ".md".
        const base = BLOG_BASE.replace(/^\.\//, "").replace(/\/$/, "");
        const files = await glob(BLOG_PATTERN, { cwd: base, absolute: false });

        const slugs = files.map((file) => file.replace(/\.md$/, "")).sort();

        await mkdir(OUTPUT_DIR, { recursive: true });
        await writeFile(
          OUTPUT_FILE,
          `${JSON.stringify(slugs, null, 2)}\n`,
          "utf8",
        );

        logger.info(
          `Wrote ${slugs.length} post slug(s) to src/generated/post-slugs.json`,
        );
      },
    },
  };
}
