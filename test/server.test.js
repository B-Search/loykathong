"use strict";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

delete process.env.MONGODB_URI;
const { server, validateWish } = require("../server");
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("reports that shared storage is disabled when no database is configured", async () => {
  const response = await fetch(`${baseUrl}/api/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: false });
});

test("returns a clear service error instead of pretending wishes were saved", async () => {
  const response = await fetch(`${baseUrl}/api/wishes`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "backend_unconfigured" });
});

test("serves the site but does not expose backend or package files", async () => {
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Moonlit River/);

  for (const pathname of ["/server.js", "/package.json", "/node_modules/mongodb/package.json"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 404, `${pathname} should not be publicly served`);
  }
});

test("rejects write methods for static files", async () => {
  const response = await fetch(`${baseUrl}/`, { method: "POST" });
  assert.equal(response.status, 405);
});

test("validates and normalizes wishes before storage", () => {
  const wish = validateWish({
    name: "  Nana  ",
    wish: "  A little wish  ",
    design: { base: "banana", flower: "lotus", color: "gold", candle: "taper", incense: true }
  });
  assert.equal(wish.name, "Nana");
  assert.equal(wish.wish, "A little wish");
  assert.equal(wish.sharedText, "A little wish");
  assert.equal(wish.design.flower, "lotus");

  assert.throws(
    () => validateWish({ wish: "hello", design: { base: "unknown" } }),
    (error) => error.status === 400 && error.code === "invalid_design"
  );
  assert.throws(
    () => validateWish({ wish: " ".repeat(501), design: {} }),
    (error) => error.status === 400 && error.code === "invalid_wish"
  );
});
