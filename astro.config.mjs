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
  // This site has no sessions and no on-demand pages. Disabling them stops
  // the adapter provisioning a SESSION KV namespace on deploy.
  session: false,
  adapter: cloudflare({
    // Transform images at build time with Sharp rather than the Cloudflare
    // Images binding. This site's images are all prerendered SVGs, and the
    // binding rejects SVG anyway.
    imageService: "compile",
    // Prerender under Node instead of workerd. The workerd prerenderer fails
    // on this machine during teardown with "Server is not running" at
    // @astrojs/cloudflare/dist/prerenderer.js, which fails the build. Every
    // route here is fully prerendered and needs no Workers APIs, so prerendering
    // in Node changes nothing about the output.
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
