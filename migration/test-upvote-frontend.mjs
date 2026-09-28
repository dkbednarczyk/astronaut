/**
 * Minimal DOM stub for exercising the bundled upvote script in Node.
 *
 * The browser tool is unavailable in this environment, so this reproduces just
 * enough of the DOM, fetch, and localStorage to drive the real bundled script
 * and assert on what the user would see.
 *
 * Usage: node migration/test-upvote-frontend.mjs <path-to-bundled-script>
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------- test state
const calls = [];
let nextResponse = { status: 200, body: { count: 0 } };
let storage = new Map();
let throwStorage = false;

globalThis.fetch = async (url, init = {}) => {
  calls.push({ url, method: init.method ?? "GET" });
  const { status, body } = nextResponse;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
};

Object.defineProperty(globalThis, "localStorage", {
  get() {
    if (throwStorage) throw new Error("SecurityError: storage disabled");
    return {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, v),
    };
  },
});

// ------------------------------------------------------------------ DOM stub
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
    this.disabled = false;
    this.listeners = {};
  }
  closest(sel) {
    if (sel === "[data-upvote]") return this.root;
    return null;
  }
  querySelector(sel) {
    // The button's root element holds the count and status children, so both
    // the button and the root need to answer these, as in a real DOM.
    if (sel === "[data-upvote-count]")
      return this === root ? countEl : this.countEl;
    if (sel === "[data-upvote-status]")
      return this === root ? statusEl : this.statusEl;
    return null;
  }
  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }
  async click() {
    for (const fn of this.listeners.click ?? []) await fn();
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

const root = new El("div");
root.dataset.slug = "two-knights";
const button = new El("button");
const countEl = new El("span");
const statusEl = new El("span");
button.root = root;
button.countEl = countEl;
button.statusEl = statusEl;

globalThis.document = {
  readyState: "complete",
  querySelectorAll: (sel) => (sel === "[data-upvote-button]" ? [button] : []),
  addEventListener: () => {},
};

// ------------------------------------------------------------------ run it
const scriptPath = process.argv[2];
const source = readFileSync(scriptPath, "utf8");
// The bundled file is a bare <script type="module"> body. Strip any tags.
const body = source.replace(/<\/?script[^>]*>/g, "");
const run = new Function(body);

// ------------------------------------------------------------------- helpers
function reset() {
  calls.length = 0;
  storage = new Map();
  throwStorage = false;
  button.dataset = {};
  button.disabled = true;
  button.attributes = {};
  countEl.textContent = "–";
  statusEl.textContent = "Loading vote count";
  button.root = root;
  button.countEl = countEl;
  button.statusEl = statusEl;
}

const settle = () => new Promise((r) => setTimeout(r, 20));

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

async function scenario(name, fn) {
  console.log(`\n${name}`);
  reset();
  await fn();
}

// -------------------------------------------------------------------- tests
console.log(`Running bundled script: ${scriptPath}\n`);

await scenario("1. Happy path: count loads, button enables", async () => {
  nextResponse = { status: 200, body: { count: 7 } };
  run();
  await settle();
  check("issued a GET to the slug endpoint", () => {
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "/api/upvote/two-knights");
  });
  check("rendered the count", () => assert.equal(countEl.textContent, "7"));
  check("button is enabled", () => assert.equal(button.disabled, false));
  check("aria-pressed is false", () =>
    assert.equal(button.getAttribute("aria-pressed"), "false"),
  );
});

await scenario(
  "2. First vote: POST, count increments, voted state sticks",
  async () => {
    nextResponse = { status: 200, body: { count: 7 } };
    run();
    await settle();

    nextResponse = { status: 200, body: { count: 8, voted: true } };
    await button.click();
    await settle();

    check("issued a POST", () => assert.equal(calls[1].method, "POST"));
    check("count is now 8", () => assert.equal(countEl.textContent, "8"));
    check("aria-pressed is true", () =>
      assert.equal(button.getAttribute("aria-pressed"), "true"),
    );
    check("status announces the vote", () =>
      assert.equal(statusEl.textContent, "You upvoted this post"),
    );
    check("localStorage flag written", () =>
      assert.equal(storage.get("upvoted:two-knights"), "1"),
    );
  },
);

await scenario(
  "3. Reload after voting: shows voted without a POST",
  async () => {
    storage.set("upvoted:two-knights", "1");
    nextResponse = { status: 200, body: { count: 8 } };
    run();
    await settle();
    check("no POST was issued", () => assert.equal(calls.length, 1));
    check("aria-pressed restored to true", () =>
      assert.equal(button.getAttribute("aria-pressed"), "true"),
    );
  },
);

await scenario(
  "4. Repeat click is harmless: count does not double",
  async () => {
    nextResponse = { status: 200, body: { count: 8 } };
    run();
    await settle();

    nextResponse = { status: 200, body: { count: 8, voted: false } };
    await button.click();
    await settle();
    check("server count wins over the optimistic bump", () =>
      assert.equal(countEl.textContent, "8"),
    );
  },
);

await scenario("5. API down on load: dash shown, button disabled", async () => {
  nextResponse = { status: 500, body: {} };
  run();
  await settle();
  check("count shows an en dash", () => assert.equal(countEl.textContent, "–"));
  check("button stays disabled", () => assert.equal(button.disabled, true));
  check("status explains why", () =>
    assert.equal(statusEl.textContent, "Vote count unavailable"),
  );
});

await scenario(
  "6. API fails mid-click: count reverts, retry possible",
  async () => {
    nextResponse = { status: 200, body: { count: 5 } };
    run();
    await settle();

    nextResponse = { status: 503, body: {} };
    await button.click();
    await settle();

    check("count reverted to 5", () => assert.equal(countEl.textContent, "5"));
    check("button re-enabled so the user can retry", () =>
      assert.equal(button.disabled, false),
    );
    check("status explains the failure", () =>
      assert.equal(
        statusEl.textContent,
        "Could not record your vote. Try again.",
      ),
    );
  },
);

await scenario("7. Unknown slug returns 404: handled, not thrown", async () => {
  nextResponse = { status: 404, body: { error: "not_found" } };
  run();
  await settle();
  check("count shows an en dash", () => assert.equal(countEl.textContent, "–"));
  check("button stays disabled", () => assert.equal(button.disabled, true));
});

await scenario(
  "7b. 400 no_identity: asks for a reload, not a retry",
  async () => {
    nextResponse = { status: 200, body: { count: 5 } };
    run();
    await settle();

    nextResponse = { status: 400, body: { error: "no_identity" } };
    await button.click();
    await settle();

    check("count reverted to 5", () => assert.equal(countEl.textContent, "5"));
    check("status tells the reader to reload", () =>
      assert.equal(statusEl.textContent, "Reload the page to vote."),
    );
    check("button stays disabled after the failure", () =>
      assert.equal(button.disabled, true),
    );
    check("the finally block did not re-enable it", () =>
      assert.equal(button.disabled, true),
    );
  },
);

await scenario(
  "8. localStorage blocked: still works, just no pre-click hint",
  async () => {
    throwStorage = true;
    nextResponse = { status: 200, body: { count: 3 } };
    run();
    await settle();
    check("count still loaded", () => assert.equal(countEl.textContent, "3"));
    check("button enabled", () => assert.equal(button.disabled, false));

    nextResponse = { status: 200, body: { count: 4, voted: true } };
    await button.click();
    await settle();
    check("vote still registered", () =>
      assert.equal(countEl.textContent, "4"),
    );
  },
);

await scenario("9. Malformed payload is rejected, not rendered", async () => {
  nextResponse = { status: 200, body: { count: "seven" } };
  run();
  await settle();
  check("string count not shown", () => assert.equal(countEl.textContent, "–"));
  check("button stays disabled", () => assert.equal(button.disabled, true));
});

await scenario(
  "10. No runtime ReferenceError: every variable resolves",
  async () => {
    nextResponse = { status: 200, body: { count: 1 } };
    run();
    await settle();
    check("count rendered without a minifier hoisting bug", () =>
      assert.equal(countEl.textContent, "1"),
    );
  },
);

console.log(
  failures === 0
    ? "\nAll frontend assertions passed."
    : `\n${failures} frontend assertion(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
