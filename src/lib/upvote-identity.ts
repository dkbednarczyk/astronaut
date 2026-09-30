import { env } from "cloudflare:workers";
import type { AstroCookies } from "astro";

const COOKIE_NAME = "__Host-upvote";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const BASE64URL = { alphabet: "base64url", omitPadding: true } as const;
const encoder = new TextEncoder();

function signingKey() {
    if (!env.SALT) throw new Error("SALT secret is not set");
    return crypto.subtle.importKey(
        "raw",
        encoder.encode(env.SALT),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

export async function issueIdentity(cookies: AstroCookies) {
    const id = crypto.getRandomValues(new Uint8Array(16)).toBase64(BASE64URL);
    const signature = await crypto.subtle.sign(
        "HMAC",
        await signingKey(),
        encoder.encode(id),
    );
    cookies.set(
        COOKIE_NAME,
        `${id}.${new Uint8Array(signature).toBase64(BASE64URL)}`,
        {
            maxAge: COOKIE_MAX_AGE,
            path: "/",
            secure: true,
            httpOnly: true,
            sameSite: "lax",
        },
    );
}

export async function readIdentity(cookies: AstroCookies) {
    const [id, signature] = cookies.get(COOKIE_NAME)?.value.split(".") ?? [];
    const signatureBytes = signature && decodeBase64Url(signature);
    if (!id || !signatureBytes) return null;

    const valid = await crypto.subtle.verify(
        "HMAC",
        await signingKey(),
        signatureBytes,
        encoder.encode(id),
    );
    return valid ? id : null;
}

function decodeBase64Url(value: string) {
    try {
        return Uint8Array.fromBase64(value, BASE64URL);
    } catch {
        return null;
    }
}

// Hashed per post so stored votes can't be linked to each other or to a cookie
export async function voterHash(id: string, slug: string) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(`${id}${slug}${env.SALT}`),
    );
    return new Uint8Array(digest).toHex();
}
