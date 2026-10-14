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
