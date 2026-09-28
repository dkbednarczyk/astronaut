// A visitor is identified by a random ID the server mints and signs with SALT,
// stored in an HttpOnly cookie. Nothing is derived from IP, device, or browser.

const COOKIE_NAME = "__Host-upvote";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function issueIdentity(salt: string): Promise<string> {
  const id = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const signature = await sign(id, salt);
  return `${COOKIE_NAME}=${id}.${signature}; Max-Age=${COOKIE_MAX_AGE}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

// Returns the ID if the cookie is present and signed by us, otherwise null
export async function readIdentity(
  request: Request,
  salt: string,
): Promise<string | null> {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== COOKIE_NAME) continue;

    const [id, signature] = rest.join("=").split(".");
    if (!id || !signature) return null;

    const expected = await sign(id, salt);
    return constantTimeEqual(signature, expected) ? id : null;
  }

  return null;
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

async function sign(id: string, salt: string): Promise<string> {
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

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
