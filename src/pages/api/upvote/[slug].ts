/**
 * Upvote endpoint for blog posts.
 *
 *   GET  /api/upvote/<slug>  -> { "count": N }, and issues an identity cookie
 *   POST /api/upvote/<slug>  -> { "count": N, "voted": true|false }
 *
 * This is an on-demand Astro route. The site is otherwise fully prerendered,
 * so `prerender = false` is what keeps this single endpoint in the Worker
 * instead of being baked into static HTML at build time.
 *
 * Bindings and secrets come from `cloudflare:workers` rather than being passed
 * on a context object, which is the documented way to reach them under the
 * Cloudflare adapter. Astro.locals.runtime was removed in the adapter upgrade.
 *
 * Requires:
 *   - D1 binding named DB
 *   - secret named SALT
 */

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
  // Counts are per-post and change on every vote, so never let a cache or the
  // Cloudflare edge serve a stale number.
  "cache-control": "no-store",
};

/** Consistent JSON error body with the right status code. */
function jsonError(status: number, error: string, message: string) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: JSON_HEADERS,
  });
}

function jsonOk(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export async function GET({ params, request }: APIContext) {
  const slug = params.slug;

  if (!isKnownSlug(slug)) {
    return jsonError(404, "not_found", "No such post.");
  }

  const row = await env.DB.prepare("SELECT count FROM votes WHERE slug = ?")
    .bind(slug)
    .first<{ count: number }>();

  // Mint an identity if the visitor does not have a valid one yet. Signing
  // needs the SALT, so a missing secret only costs the cookie, not the count.
  const headers: Record<string, string> = {};
  const salt = env.SALT;
  const identity = salt ? await readIdentity(request, salt) : null;

  if (salt && !identity) {
    headers["set-cookie"] = await issueIdentity(salt);
  }

  // Report whether this identity has already voted, so the client can grey the
  // button out without sending a POST that would be rejected anyway. This is
  // authoritative in a way the client's localStorage flag is not: the flag can
  // be cleared, while the cookie and this lookup cannot.
  const voted = identity ? await hasVoted(identity, slug, salt) : false;

  return jsonOk({ count: row ? row.count : 0, voted }, 200, headers);
}

export async function POST({ params, request }: APIContext) {
  const slug = params.slug;

  if (!isKnownSlug(slug)) {
    return jsonError(404, "not_found", "No such post.");
  }

  if (isVerifiedBot(request)) {
    return jsonError(403, "bot", "Automated traffic cannot vote.");
  }

  const salt = env.SALT;
  if (!salt) {
    // Never fall back to a default salt: a known salt would let anyone forge
    // identity cookies and vote without limit.
    return jsonError(500, "server_error", "Upvoting is not configured.");
  }

  // A vote requires an identity this server issued. Rejecting rather than
  // minting one here is deliberate: if a POST without a cookie were allowed to
  // create a new identity, a script could loop GET-less POSTs forever.
  const id = await readIdentity(request, salt);
  if (!id) {
    return jsonError(400, "no_identity", "Reload the page and try again.");
  }

  const hash = await sha256(`${id}${slug}${salt}`);
  const now = Math.floor(Date.now() / 1000);

  // Insert the voter first. The primary key makes this the concurrency guard:
  // two simultaneous requests with the same identity race here and exactly one
  // wins. Only the winner increments the counter.
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO voters (hash, created_at) VALUES (?, ?)",
  )
    .bind(hash, now)
    .run();

  const firstVote = (inserted?.meta?.changes ?? 0) > 0;

  if (firstVote) {
    await env.DB.prepare(
      "INSERT INTO votes (slug, count) VALUES (?, 1) ON CONFLICT (slug) DO UPDATE SET count = count + 1",
    )
      .bind(slug)
      .run();
  }

  const row = await env.DB.prepare("SELECT count FROM votes WHERE slug = ?")
    .bind(slug)
    .first<{ count: number }>();

  return jsonOk({ count: row ? row.count : 0, voted: true });
}

/**
 * Whether this identity already has a voter record for this slug.
 *
 * The hash is the voters table's primary key, so this is an index lookup. It
 * exists so the client can disable the button instead of firing a POST that
 * would be rejected and bounce the count back down.
 */
async function hasVoted(
  id: string,
  slug: string,
  salt: string,
): Promise<boolean> {
  const hash = await sha256(`${id}${slug}${salt}`);
  const row = await env.DB.prepare(
    "SELECT 1 AS seen FROM voters WHERE hash = ? LIMIT 1",
  )
    .bind(hash)
    .first<{ seen: number }>();
  return row !== null;
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      // Same-origin only. The button is served from the same site, so there is
      // no reason to allow a cross-origin caller to vote.
      "access-control-allow-origin": "none",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

/** Only slugs that match a real post are accepted; everything else is a 404. */
function isKnownSlug(slug: string | undefined): slug is string {
  return typeof slug === "string" && SLUGS.includes(slug);
}

/**
 * True for traffic Cloudflare has positively identified as a known bot.
 *
 * verifiedBotCategory and botManagement.verifiedBot identify known bots by
 * reverse DNS. They classify bots; they do not fingerprint people, so this adds
 * no privacy cost to real visitors. Unrecognised traffic is treated as human,
 * so this can never block a genuine reader.
 */
function isVerifiedBot(request: Request): boolean {
  const cf = (request as Request & { cf?: IncomingCf }).cf;
  if (!cf) return false;
  if (cf.verifiedBotCategory) return true;
  return cf.botManagement?.verifiedBot === true;
}

type IncomingCf = {
  verifiedBotCategory?: string;
  botManagement?: { verifiedBot?: boolean };
};
