import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handler } from "../netlify/functions/api.mjs";
import { initial, shopping } from "../netlify/private/data.mjs";
const data = { ...initial, shopping, shoppingDone: [] };
let row;
const event = (action, method = "GET", body, cookie = "") => ({
  httpMethod: method,
  headers: { host: "example.test", origin: "https://example.test", cookie },
  queryStringParameters: { action },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const call = (action, method, body, cookie) =>
  handler(event(action, method, body, cookie));
async function login() {
  const r = await call("login", "POST", { password: "test-password" });
  return r.headers["Set-Cookie"].split(";")[0];
}
beforeEach(() => {
  process.env.APP_PASSWORD = "test-password";
  process.env.COOKIE_SECRET = "a".repeat(64);
  process.env.SUPABASE_URL = "https://database.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-server-key";
  row = { data: {}, updated_at: "2026-01-01T00:00:00.000Z" };
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.headers.apikey, "test-server-key");
    if (url.includes("/rpc/allow_login_attempt")) return Response.json(true);
    if (url.includes("/rest/v1/trip_state")) {
      if (options.method === "PATCH") {
        if (
          new URL(url).searchParams.get("updated_at") !== `eq.${row.updated_at}`
        )
          return Response.json([]);
        row = JSON.parse(options.body);
        return Response.json([row]);
      }
      return Response.json([row]);
    }
    return new Response(Buffer.from("photo"), {
      headers: { "Content-Type": "image/webp" },
    });
  };
});
test("all trip and photo routes require authentication", async () => {
  for (const [action, method] of [
    ["state", "GET"],
    ["state", "PUT"],
    ["stock", "GET"],
    ["photo", "GET"],
    ["upload", "POST"],
    ["deletePhoto", "POST"],
  ])
    assert.equal((await call(action, method, {})).statusCode, 401);
});
test("login, 30 day cookie, invalid password, tampering, expiration and logout", async () => {
  assert.equal(
    (await call("login", "POST", { password: "wrong" })).statusCode,
    401,
  );
  const r = await call("login", "POST", { password: "test-password" });
  const cookie = r.headers["Set-Cookie"];
  for (const value of ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=2592000"])
    assert.ok(cookie.includes(value));
  assert.equal((await call("check", "GET", undefined, cookie)).statusCode, 200);
  assert.equal(
    (
      await call(
        "check",
        "GET",
        undefined,
        cookie.replace("jeju_session=", "jeju_session=x"),
      )
    ).statusCode,
    401,
  );
  const expiry = String(Date.now() - 1000);
  const mac = crypto
    .createHmac("sha256", process.env.COOKIE_SECRET)
    .update(process.env.APP_PASSWORD)
    .update("\0")
    .update(expiry)
    .digest("hex");
  assert.equal(
    (await call("check", "GET", undefined, `jeju_session=${expiry}.${mac}`))
      .statusCode,
    401,
  );
  assert.ok(
    (await call("logout", "POST")).headers["Set-Cookie"].includes("Max-Age=0"),
  );
  process.env.APP_PASSWORD = "changed";
  assert.equal((await call("check", "GET", undefined, cookie)).statusCode, 401);
});
test("initial state remains server-side and optimistic lock rejects stale saves", async () => {
  const cookie = await login();
  const r = JSON.parse((await call("state", "GET", undefined, cookie)).body);
  assert.equal(r.data.days.length, 4);
  assert.equal(
    (await call("state", "PUT", { data, revision: r.revision }, cookie))
      .statusCode,
    200,
  );
  assert.equal(
    (await call("state", "PUT", { data, revision: r.revision }, cookie))
      .statusCode,
    409,
  );
  assert.deepEqual(row.data, data);
});
test("rejects malformed input and cross-origin mutations", async () => {
  const cookie = await login();
  for (const data of [
    null,
    [],
    { days: [] },
    { ...initial, hero: "https://tracker.test/image" },
  ])
    assert.equal(
      (await call("state", "PUT", { data, revision: row.updated_at }, cookie))
        .statusCode,
      400,
    );
  const bad = event("login", "POST");
  bad.body = "{";
  assert.equal((await handler(bad)).statusCode, 400);
  const cross = event("login", "POST", { password: "test-password" });
  cross.headers.origin = "https://evil.test";
  assert.equal((await handler(cross)).statusCode, 403);
  assert.equal(
    (await call("upload", "POST", { type: "text/html", base64: "abc" }, cookie))
      .statusCode,
    400,
  );
});
test("stock images are protected and traversal is refused", async () => {
  const cookie = await login();
  const e = event("stock", "GET", undefined, cookie);
  e.queryStringParameters.name = "cafe.webp";
  const r = await handler(e);
  assert.equal(r.statusCode, 200);
  assert.equal(r.isBase64Encoded, true);
  assert.equal(r.headers["Cache-Control"], "no-store");
  e.queryStringParameters.name = "../../.env";
  assert.equal((await handler(e)).statusCode, 404);
});

test("photo upload validates bytes, stores privately and deletes only unreferenced files", async () => {
  const cookie = await login();
  assert.equal(
    (
      await call(
        "upload",
        "POST",
        {
          type: "image/webp",
          base64: Buffer.from("<html>").toString("base64"),
        },
        cookie,
      )
    ).statusCode,
    400,
  );
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile("netlify/private/photos/cafe.webp");
  const r = await call(
    "upload",
    "POST",
    { type: "image/webp", base64: bytes.toString("base64") },
    cookie,
  );
  assert.equal(r.statusCode, 200);
  const { path } = JSON.parse(r.body);
  row.data = { ...data, hero: `uploaded:${path}` };
  assert.deepEqual(
    JSON.parse((await call("deletePhoto", "POST", { path }, cookie)).body),
    { retained: true },
  );
  row.data = data;
  assert.equal(
    (await call("deletePhoto", "POST", { path }, cookie)).statusCode,
    200,
  );
  assert.equal(
    (await call("deletePhoto", "POST", { path: "../secret" }, cookie))
      .statusCode,
    400,
  );
});
test("login throttle denies access even with correct password", async () => {
  globalThis.fetch = async () => Response.json(false);
  assert.equal(
    (await call("login", "POST", { password: "test-password" })).statusCode,
    429,
  );
});
