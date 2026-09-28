/**
 * Vote identity: an opaque, server-signed identifier for a visitor.
 *
 * A visitor is identified by a random ID this server invents and stores in an
 * HttpOnly cookie. Nothing is derived from their network, device, or browser:
 * no IP, no User-Agent, no TLS fingerprint. The server simply remembers a number
 * it made up.
 *
 * The signature is what makes this safe. Without it anyone could mint their own
 * IDs and vote without limit. With it, only IDs this server issued are accepted,
 * and forging one requires the SALT.
 *
 * Only SHA-256 of the ID is stored, so a database dump cannot be replayed as
 * working cookies.
 *
 * Clearing cookies grants a fresh vote. That is the honest cost of not
 * fingerprinting anyone, and it is a deliberate choice.
 */

const COOKIE_NAME = "__Host-upvote";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year

export const IDENTITY_COOKIE = COOKIE_NAME;

/** Mints a fresh random identity, signed so only this server can produce it. */
export async function issueIdentity(salt: string): Promise<string> {
  const id = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const signature = await sign(id, salt);
  // __Host- prefix: the browser enforces Secure, Path=/, and no Domain.
  return `${COOKIE_NAME}=${id}.${signature}; Max-Age=${COOKIE_MAX_AGE}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

/**
 * Returns the visitor's identity ID, or null if absent, malformed, or not
 * signed by this server. The signature check is what stops self-issued IDs.
 */
export async function readIdentity(
  request: Request,
  salt: string,
): Promise<string | null> {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== COOKIE_NAME) continue;

    const value = rest.join("=");
    // The ID is base64url and cannot contain a dot, so the last dot separates
    // the ID from the signature.
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

export async function sign(id: string, salt: string): Promise<string> {
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
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
