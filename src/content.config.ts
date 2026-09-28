import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { BLOG_BASE, BLOG_PATTERN } from "./blog-source";

const blog = defineCollection({
  loader: glob({ pattern: BLOG_PATTERN, base: BLOG_BASE }),
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string(),
  }),
});

export const collections = {
  blog,
};
