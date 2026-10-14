import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../verification.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function assignVerifiedRole(");
const end = source.indexOf('\n__name(assignVerifiedRole, "assignVerifiedRole");', start);
assert.ok(start >= 0 && end > start, "OAuth role assignment function must exist");
const roleFunction = source.slice(start, end);

function fakeRoleApi(roles) {
  const calls = [];
  const discord = async (path, opts = {}) => {
    calls.push({ path, method: opts.method || "GET" });
    if (path.endsWith("/roles") && !opts.method) return roles;
    if (opts.method === "PUT" || opts.method === "DELETE") return null;
    throw new Error("Unexpected Discord request: " + opts.method + " " + path);
  };
  const context = { discord };
  runInNewContext(roleFunction + "; this.assignVerifiedRole = assignVerifiedRole;", context);
  return { assign: context.assignVerifiedRole, calls };
}

const guild = "1559829257952174192";
const verified = "1560003144036126853";
const unverified = "1560003406687371355";
const env = { DISCORD_BOT_TOKEN: "private-test-value" };

test("Team lb grants existing Verified, then removes existing Unverified", async () => {
  const { assign, calls } = fakeRoleApi([
    { id: verified, name: "Verified", managed: false },
    { id: unverified, name: "Unverified", managed: false },
  ]);
  assert.equal(await assign("123456789012345678", guild, env), true);
  assert.deepEqual(calls.map(({method}) => method), ["GET", "PUT", "DELETE"]);
  assert.equal(calls[1].path, `guilds/${guild}/members/123456789012345678/roles/${verified}`);
  assert.equal(calls[2].path, `guilds/${guild}/members/123456789012345678/roles/${unverified}`);
});

test("Team lb does not create replacement roles when real role is missing", async () => {
  const { assign, calls } = fakeRoleApi([
    { id: unverified, name: "Unverified", managed: false },
  ]);
  assert.equal(await assign("123456789012345678", guild, env), false);
  assert.deepEqual(calls.map(({method}) => method), ["GET"]);
});

test("Other servers retain their own existing verified role", async () => {
  const other = "222222222222222222";
  const otherRole = "333333333333333333";
  const { assign, calls } = fakeRoleApi([
    { id: otherRole, name: "Verified", managed: false },
  ]);
  assert.equal(await assign("123456789012345678", other, env), true);
  assert.deepEqual(calls.map(({method}) => method), ["GET", "PUT"]);
  assert.equal(calls[1].path, `guilds/${other}/members/123456789012345678/roles/${otherRole}`);
});

test("OAuth identity is recorded even if website role edit needs Wispbyte fallback", () => {
  const oauthStart = source.indexOf('if (path === "/oauth/callback"');
  const oauthEnd = source.indexOf('if (path === "/api/admin"', oauthStart);
  assert.ok(oauthStart >= 0 && oauthEnd > oauthStart);
  const callback = source.slice(oauthStart, oauthEnd);
  assert.equal((callback.match(/role_granted = await assignVerifiedRole/g) || []).length, 2);
  assert.equal((callback.match(/await registry.record\(user, pending.server\)/g) || []).length, 2);
  assert.equal((callback.match(/if \(!role_granted\) throw fail/g) || []).length, 0);
  const record = callback.lastIndexOf("await registry.record(user, pending.server)");
  const roleUpdate = callback.lastIndexOf("role_granted = await assignVerifiedRole");
  assert.ok(record >= 0 && roleUpdate > record, "Store OAuth record before optional role assignment");
  assert.match(callback, /if \(role_granted\) \{/);
  assert.match(callback, /ctx\.waitUntil\(notify\(\)\)/);
});

test("Verification webpage checks role success rather than trusting the OAuth redirect", () => {
  const client = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(client, /if\(d\.role_granted!==true\)/);
  assert.match(client, /Verification processing/);
  assert.match(client, /api\('me'\)/);
  assert.match(client, /status\(q\.get\('error'\)/);
});

test("Team lb is the default even when an earlier dashboard server was saved", async () => {
  const start = source.indexOf("async function selectedServer(");
  const end = source.indexOf('\n__name(selectedServer, "selectedServer");', start);
  assert.ok(start >= 0 && end > start);
  const context = { guilds: async () => [] };
  runInNewContext(
    source.slice(start, end) + "; this.selectedServer = selectedServer;",
    context
  );
  const server = await context.selectedServer(
    { config: async () => ({ id: "1553398685587607614", name: "Old server" }) },
    {
      DEFAULT_SERVER_ID: guild,
      DEFAULT_SERVER_NAME: "Donut SMP | Team lb",
      DISCORD_BOT_TOKEN: "test",
      DISCORD_CLIENT_ID: "test",
      DISCORD_CLIENT_SECRET: "test",
      SESSION_SECRET: "test"
    },
  );
  assert.equal(server.id, guild);
  assert.equal(server.name, "Donut SMP | Team lb");
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(wrangler, /"DEFAULT_SERVER_ID": "1559829257952174192"/);
});

test("Private website OAuth registry requires a long shared key or the same bot", () => {
  const beginning = source.indexOf("function websiteSyncAuthorized(");
  const ending = source.indexOf('\n__name(websiteSyncAuthorized, "websiteSyncAuthorized");', beginning);
  assert.ok(beginning >= 0 && ending > beginning);
  const context = { equal: (a, b) => a === b };
  runInNewContext(
    source.slice(beginning, ending) + "; this.canSync = websiteSyncAuthorized;",
    context
  );
  const env = { VERIFY_SYNC_KEY: "z".repeat(40), DISCORD_BOT_TOKEN: "discord-private" };
  assert.equal(context.canSync("Bearer " + "z".repeat(40), env), true);
  assert.equal(context.canSync("Bot discord-private", env), true);
  assert.equal(context.canSync("Bearer wrong", env), false);
  assert.equal(context.canSync("Bearer short", { VERIFY_SYNC_KEY: "short" }), false);
  assert.equal(context.canSync("", {}), false);
});

test("Website sync returns OAuth timestamps and live role checks", () => {
  const begin = source.indexOf('if (path === "/api/bot/verified"');
  const end = source.indexOf('if (path === "/api/logout"', begin);
  const endpoint = source.slice(begin, end);
  assert.match(endpoint, /websiteSyncAuthorized/);
  assert.match(endpoint, /verified_at: m\.verified_at/);
  assert.match(endpoint, /source: "verify\.lb000\.xyz"/);
  assert.match(endpoint, /member\.roles\.includes\("1560003144036126853"\)/);
  assert.match(endpoint, /!member\.roles\.includes\("1560003406687371355"\)/);
});
