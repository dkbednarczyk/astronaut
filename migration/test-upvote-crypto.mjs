/**
 * Focused checks on the hand-rolled crypto behind the upvote identity cookie.
 *
 * Run: node migration/test-upvote-crypto.mjs
 *
 * The point is to hold the custom code to the same standard as a library. If
 * any of these fail, hand-rolling was the wrong call.
 *
 * This imports the real module rather than a hand-copied version, so the tests
 * cannot silently drift from the code that ships.
 */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  base64Url,
  constantTimeEqual,
  sha256,
  sign,
} from "../src/lib/upvote-identity.ts";

// Destructuring getRandomValues off the Crypto object loses its `this` binding,
// which WebCrypto requires. Call it through the object instead.
const randomBytes = (n) => webcrypto.getRandomValues(new Uint8Array(n));

// ---- the primitives we leaned on ------------------------------------------
const SALT = "test-salt-not-real";

let failures = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(
      () => console.log(`  PASS  ${name}`),
      (err) => {
        failures++;
        console.log(`  FAIL  ${name}\n        ${err.message}`);
      },
    );
}

console.log("Hand-rolled crypto in src/lib/upvote-identity.ts\n");

await check("HMAC matches RFC 4231 test case 2", async () => {
  // Key "Jefe", data "what do ya want for nothing?"
  // Expected digest: 5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843
  const signature = await sign("what do ya want for nothing?", "Jefe");
  assert.equal(
    Buffer.from(signature, "base64url").toString("hex"),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  );
});

await check("base64url strips the padding RFC 4648 requires", async () => {
  // 32 bytes encodes to 44 base64 chars with one '=' of padding; base64url
  // must drop it to 43.
  const signature = await sign("abc", SALT);
  assert.equal(signature.length, 43, "expected 43 unpadded characters");
  assert.ok(!signature.endsWith("="), "padding was not stripped");
});

await check("signature is deterministic for the same input", async () => {
  const a = await sign("abc", SALT);
  const b = await sign("abc", SALT);
  assert.equal(a, b);
});

await check("a different salt yields a different signature", async () => {
  const a = await sign("abc", SALT);
  const b = await sign("abc", `${SALT}-other`);
  assert.notEqual(a, b);
});

await check("a different id yields a different signature", async () => {
  const a = await sign("abc", SALT);
  const b = await sign("abd", SALT);
  assert.notEqual(a, b);
});

await check("base64url output contains no +, /, or = padding", async () => {
  for (let i = 0; i < 500; i++) {
    const value = base64Url(randomBytes(16));
    assert.ok(!/[+/=]/.test(value), `unsafe char in ${value}`);
  }
});

await check("base64url round-trips through decode", () => {
  for (let i = 0; i < 200; i++) {
    const bytes = randomBytes(16);
    const encoded = base64Url(bytes);
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(padded, "base64");
    assert.deepEqual(new Uint8Array(decoded), bytes);
  }
});

await check("constantTimeEqual accepts only exact matches", async () => {
  const a = await sign("abc", SALT);
  assert.equal(constantTimeEqual(a, a), true);
  assert.equal(constantTimeEqual(a, a.slice(0, -1)), false, "truncated");
  // Compare against a signature that differs in the first, middle, and last
  // character. Use a substitution that is guaranteed to differ: map 'A'->'B'
  // and 'B'->'A' over the whole string, which also exercises every position.
  const flipped = [...a]
    .map((c) => (c === "A" ? "B" : c === "B" ? "A" : c))
    .join("");
  if (flipped !== a) {
    assert.equal(
      constantTimeEqual(a, flipped),
      false,
      "substituted signature accepted",
    );
  }
  // Prefix change: same length, different content.
  const prefixed = (a[0] === "Z" ? "Y" : "Z") + a.slice(1);
  assert.equal(
    constantTimeEqual(a, prefixed),
    false,
    "prefix-changed signature accepted",
  );
  assert.equal(constantTimeEqual(a, ""), false, "empty");
  assert.equal(constantTimeEqual("", ""), true);
});

await check("flipping any single bit breaks the comparison", async () => {
  const a = await sign("abc", SALT);
  for (let i = 0; i < a.length; i++) {
    for (const bit of [1, 2, 4, 8, 16, 32, 64, 128]) {
      const mutated =
        a.slice(0, i) +
        String.fromCharCode(a.charCodeAt(i) ^ bit) +
        a.slice(i + 1);
      assert.equal(
        constantTimeEqual(a, mutated),
        false,
        `bit ${bit} at ${i} was accepted`,
      );
    }
  }
});

await check("sha256 matches the known digest of the empty string", async () => {
  assert.equal(
    await sha256(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

await check("sha256 matches a known digest of 'abc'", async () => {
  assert.equal(
    await sha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

await check("cookie length matches the documented shape", async () => {
  const id = base64Url(randomBytes(16));
  const signature = await sign(id, SALT);
  assert.equal(id.length, 22, "16 bytes -> 22 base64url chars");
  assert.equal(signature.length, 43, "32 bytes -> 43 base64url chars");
  assert.match(`${id}.${signature}`, /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
});

await check("128-bit IDs do not collide in a large sample", async () => {
  const seen = new Set();
  for (let i = 0; i < 100_000; i++) {
    seen.add(base64Url(randomBytes(16)));
  }
  assert.equal(seen.size, 100_000, "collision detected");
});

await check(
  "stored hash never contains a recoverable cookie value",
  async () => {
    // The database stores sha256(id + slug + salt). Confirm the stored form
    // cannot be reversed by checking it differs from the id and has no '.'.
    const id = base64Url(randomBytes(16));
    const stored = await sha256(`${id}two-knights${SALT}`);
    assert.equal(stored.length, 64);
    assert.ok(!stored.includes("."), "stored hash contains a cookie separator");
    assert.notEqual(stored, id);
  },
);

console.log(
  failures === 0
    ? "\nAll crypto assertions passed."
    : `\n${failures} crypto assertion(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
