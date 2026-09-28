/**
 * Upvote endpoint for blog posts.
 *
 *   GET  /api/upvote/<slug>  -> { "count": N }, and issues an identity cookie
 *   POST /api/upvote/<slug>  -> { "count": N, "voted": true|false }
 *
 * Identity
 * --------
 * A visitor is identified by an opaque random ID the server mints and stores
 * in an HttpOnly cookie, signed with HMAC-SALT. Nothing about the visitor is
 * derived from their network, device, or browser: no IP, no User-Agent, no TLS
 * fingerprint. The server simply remembers a number it invented. Clearing
 * cookies grants a fresh vote, which is the honest cost of that choice.
 *
 * The signature is what makes this work. Without it, anyone could mint their
 * own IDs and vote without limit; with it, only IDs this server issued are
 * accepted, and forging one requires the SALT.
 *
 * Only SHA-256 of the ID is stored, so a database dump cannot be replayed as
 * live cookies.
 *
 * Bot handling
 * ------------
 * request.cf.verifiedBotCategory and botManagement.verifiedBot positively
 * identify *known* good bots (search engines, monitors, AI scrapers) via
 * reverse DNS. They classify bots, they do not fingerprint people, so this
 * adds no privacy cost to real visitors. Verified bots cannot vote.
 *
 * Requires:
 *   - D1 binding named DB
 *   - secret named SALT
 */

// Path is relative to this file: functions/api/upvote/ -> repo root.
import SLUGS from "../../../src/generated/post-slugs.json";

const COOKIE_NAME = "__Host-upvote";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // Counts are per-post and change on every vote, so never let a cache or
  // the Cloudflare edge serve a stale number.
  "cache-control": "no-store",
};

/** Consistent JSON error body with the right status code. */
function jsonError(status, error, message) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: JSON_HEADERS,
  });
}

function jsonOk(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export async function onRequestGet(context) {
  const { slug } = context.params;
  const { env, request } = context;

  if (!isKnownSlug(slug)) {
    return jsonError(404, "not_found", "No such post.");
  }

  const row = await env.DB.prepare("SELECT count FROM votes WHERE slug = ?")
    .bind(slug)
    .first();

  // Mint an identity if the visitor does not have a valid one yet. Signing
  // needs the SALT, so a missing secret only costs the cookie, not the count.
  const headers = {};
  if (env.SALT && !(await readIdentity(request, env.SALT))) {
    headers["set-cookie"] = await issueIdentity(env.SALT);
  }

  return jsonOk({ count: row ? row.count : 0 }, 200, headers);
}

export async function onRequestPost(context) {
  const { slug } = context.params;
  const { env, request } = context;

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
  // minting one here is deliberate: if a POST without a cookie were allowed
  // to create a new identity, a script could loop GET-less POSTs forever.
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
    .first();

  return jsonOk({ count: row ? row.count : 0, voted: firstVote });
}

export async function onRequestOptions() {
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
function isKnownSlug(slug) {
  return typeof slug === "string" && SLUGS.includes(slug);
}

/**
 * True for traffic Cloudflare has positively identified as a known bot.
 * Unrecognised traffic is treated as human, so this never blocks a real reader.
 */
function isVerifiedBot(request) {
  const cf = request.cf;
  if (!cf) return false;
  if (cf.verifiedBotCategory) return true;
  return cf.botManagement?.verifiedBot === true;
}

/** Mints a fresh random identity, signed so only this server can produce it. */
async function issueIdentity(salt) {
  const id = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const signature = await sign(id, salt);
  // __Host- prefix: browser enforces Secure, Path=/, and no Domain attribute.
  return `${COOKIE_NAME}=${id}.${signature}; Max-Age=${COOKIE_MAX_AGE}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

/**
 * Returns the visitor's identity ID, or null if absent, malformed, or not
 * signed by this server. The signature check is what stops self-issued IDs.
 */
async function readIdentity(request, salt) {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== COOKIE_NAME) continue;

    const value = rest.join("=");
    const separator = value.lastIndexOf(".");
    if (separator <= 0) return null;

    const id = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    if (!id || !signature) return null;

    const expected = await sign(id, salt);
    return constantTimeEqual(signature, expected) ? id : null;
  }

  return null;
}

async function sign(id, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(id),
  );
  return base64Url(new Uint8Array(mac));
}

/** Length-independent comparison, so a wrong signature cannot be timed. */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
