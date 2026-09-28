// GET  /api/upvote/<slug> -> { count, voted }, issuing an identity cookie if needed
// POST /api/upvote/<slug> -> { count, voted: true }

import { env } from "cloudflare:workers";
import type { APIContext } from "astro";
import SLUGS from "../../../generated/post-slugs.json";
import {
  issueIdentity,
  readIdentity,
  sha256,
} from "../../../lib/upvote-identity";

export const prerender = false;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export async function GET({ params, request }: APIContext) {
  const slug = params.slug;
  if (!isKnownSlug(slug)) return json({ error: "not_found" }, 404);

  const salt = env.SALT;
  const identity = salt ? await readIdentity(request, salt) : null;

  const headers: Record<string, string> = {};
  if (salt && !identity) {
    headers["set-cookie"] = await issueIdentity(salt);
  }

  const voted = identity ? await hasVoted(identity, slug, salt) : false;

  return json({ count: await getCount(slug), voted }, 200, headers);
}

export async function POST({ params, request }: APIContext) {
  const slug = params.slug;
  if (!isKnownSlug(slug)) return json({ error: "not_found" }, 404);
  if (isVerifiedBot(request)) return json({ error: "bot" }, 403);

  // Never fall back to a default: a known salt would let anyone forge cookies
  const salt = env.SALT;
  if (!salt) return json({ error: "server_error" }, 500);

  // Identities are only minted on GET, so a script can't loop cookieless POSTs
  const id = await readIdentity(request, salt);
  if (!id) return json({ error: "no_identity" }, 400);

  // The primary key on voters is the deduplication guard. The batch runs as one
  // transaction, and changes() only lets the count move if the voter was new.
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO voters (hash, created_at) VALUES (?, ?)",
    ).bind(await voterHash(id, slug, salt), Math.floor(Date.now() / 1000)),
    env.DB.prepare(
      "INSERT INTO votes (slug, count) SELECT ?, 1 WHERE changes() > 0 ON CONFLICT (slug) DO UPDATE SET count = count + 1",
    ).bind(slug),
  ]);

  return json({ count: await getCount(slug), voted: true });
}

async function getCount(slug: string): Promise<number> {
  const row = await env.DB.prepare("SELECT count FROM votes WHERE slug = ?")
    .bind(slug)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function hasVoted(id: string, slug: string, salt: string) {
  const row = await env.DB.prepare("SELECT 1 FROM voters WHERE hash = ?")
    .bind(await voterHash(id, slug, salt))
    .first();
  return row !== null;
}

function voterHash(id: string, slug: string, salt: string) {
  return sha256(`${id}${slug}${salt}`);
}

function isKnownSlug(slug: string | undefined): slug is string {
  return typeof slug === "string" && SLUGS.includes(slug);
}

function isVerifiedBot(request: Request): boolean {
  const cf = request.cf as
    | {
        verifiedBotCategory?: string;
        botManagement?: { verifiedBot?: boolean };
      }
    | undefined;
  return Boolean(cf?.verifiedBotCategory || cf?.botManagement?.verifiedBot);
}
