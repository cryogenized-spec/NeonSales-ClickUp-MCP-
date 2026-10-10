"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { inspectNpmCli, isSafe } = require("./check-npm-cli-bundles.cjs");

function fixture(t, overrides = {}, nested = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "npm-cli-guard-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (rel, value) => {
    const loc = path.join(root, rel);
    fs.mkdirSync(path.dirname(loc), { recursive: true });
    fs.writeFileSync(loc, JSON.stringify(value));
  };
  put("package.json", { name: "npm", version: "12.2.0" });
  for (const [name, version] of Object.entries({
    "brace-expansion": "5.0.12",
    "ip-address": "10.7.3",
    undici: "6.29.0",
    ...overrides,
  })) {
    if (version !== null) put(path.join("node_modules", name, "package.json"), { name, version });
  }
  if (nested) {
    put("node_modules/a/node_modules/brace-expansion/package.json", {
      name: "brace-expansion",
      version: "5.0.9",
    });
  }
  return root;
}

test("patched bundle versions pass in a synthetic CLI tree", t => {
  const result = inspectNpmCli(fixture(t));
  assert.equal(result.version, "12.2.0");
  assert.deepEqual(result.problems, []);
});

test("rejects all three documented vulnerable bundled versions", t => {
  const result = inspectNpmCli(fixture(t, {
    "brace-expansion": "5.0.9",
    "ip-address": "10.5.0",
    undici: "6.28.0",
  }));
  assert.equal(result.problems.length, 3);
  for (const name of ["brace-expansion", "ip-address", "undici"]) {
    assert.ok(result.problems.some(x => x.startsWith(name + "@")));
  }
});

test("rejects nested vulnerable duplicates even if the root copy is patched", t => {
  const result = inspectNpmCli(fixture(t, {}, true));
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /brace-expansion@5\.0\.9/);
});

test("fails closed on missing packages or unknown major versions", t => {
  const result = inspectNpmCli(fixture(t, { "ip-address": null, "brace-expansion": "6.0.0" }));
  assert.equal(result.problems.length, 2);
  assert.ok(result.problems.some(x => x.includes("Missing bundled ip-address")));
  assert.ok(result.problems.some(x => x.includes("brace-expansion@6.0.0")));
  assert.equal(isSafe("brace-expansion", "garbage"), false);
});

test("rejects wrong CLI root and missing dependency tree", t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "not-npm" }));
  assert.throws(() => inspectNpmCli(root), /not an npm CLI/);
});
