import { getEntry } from "astro:content";
import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { issueIdentity, readIdentity, voterHash } from "@/lib/upvote-identity";

export const prerender = false;

const NO_STORE = { headers: { "cache-control": "no-store" } };

export const GET: APIRoute = async ({ params, cookies }) => {
    const slug = await findPost(params.slug);
    if (!slug) return new Response(null, { status: 404 });

    const id = await readIdentity(cookies);
    if (!id) await issueIdentity(cookies);

    const [count, voted] = await Promise.all([
        countVotes(slug),
        id ? hasVoted(id, slug) : false,
    ]);
    return Response.json({ count, voted }, NO_STORE);
};

export const POST: APIRoute = async ({ params, cookies }) => {
    const slug = await findPost(params.slug);
    if (!slug) return new Response(null, { status: 404 });

    // Identities are only issued on GET, so every vote costs a round trip
    const id = await readIdentity(cookies);
    if (!id) return new Response(null, { status: 403 });

    // The batch is one transaction, and changes() only lets the count move if
    // the voter row was new
    await env.DB.batch([
        env.DB.prepare(
            "INSERT OR IGNORE INTO voters (hash, created_at) VALUES (?, unixepoch())",
        ).bind(await voterHash(id, slug)),
        env.DB.prepare(
            "INSERT INTO votes (slug, count) SELECT ?, 1 WHERE changes() > 0 ON CONFLICT (slug) DO UPDATE SET count = count + 1",
        ).bind(slug),
    ]);

    return Response.json(
        { count: await countVotes(slug), voted: true },
        NO_STORE,
    );
};

async function findPost(slug: string | undefined) {
    return slug ? (await getEntry("blog", slug))?.id : undefined;
}

async function countVotes(slug: string) {
    const count = await env.DB.prepare("SELECT count FROM votes WHERE slug = ?")
        .bind(slug)
        .first<number>("count");
    return count ?? 0;
}

async function hasVoted(id: string, slug: string) {
    const row = await env.DB.prepare("SELECT 1 FROM voters WHERE hash = ?")
        .bind(await voterHash(id, slug))
        .first();
    return row !== null;
}
