import cloudflare from "@astrojs/cloudflare";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { SITE_URL } from "./src/consts";
import { postSlugs } from "./src/integrations/post-slugs";

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  // Otherwise the adapter provisions a KV namespace for sessions we don't use
  session: false,
  adapter: cloudflare({
    // The Cloudflare Images binding rejects SVGs
    imageService: "compile",
    // The workerd prerenderer fails during teardown
    prerenderEnvironment: "node",
  }),
  integrations: [sitemap(), postSlugs()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
    shikiConfig: {
      themes: {
        light: "github-light-default",
        dark: "github-dark-default",
      },
    },
  },
});
