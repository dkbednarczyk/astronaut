import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { SITE_TITLE } from "../consts";
import { byPubDateDesc } from "../utils";

export async function GET(context: APIContext) {
  if (!context.site) {
    throw new Error("RSS generation requires the site's URL to be configured.");
  }

  const blog = (await getCollection("blog")).sort(byPubDateDesc);
  return rss({
    title: `${SITE_TITLE} Blog`,
    description:
      "Posts on reverse engineering, systems programming, and AI-assisted development by Damian Bednarczyk.",
    site: context.site,
    items: blog.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.id}/`,
    })),
    customData: `<language>en-us</language>`,
  });
}
