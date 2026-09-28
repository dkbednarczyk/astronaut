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
