// Fail-closed supply-chain check for bundled dependencies of the ACTUAL installed npm CLI.
// A project-level npm audit does NOT inspect a globally installed npm package's bundle.
// Consult the current GitHub Security Advisories before raising/lowering these thresholds.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const MINIMUMS = Object.freeze({
  "brace-expansion": Object.freeze({
    1: "1.1.20",
    2: "2.1.6",
    3: "3.0.8",
    5: "5.0.12",
  }),
  "ip-address": Object.freeze({ 10: "10.7.1" }),
  undici: Object.freeze({ 6: "6.28.1" }),
});

function versionParts(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Invalid/unexpected version: " + String(version));
  }
  return version.split(".").map(Number);
}

function isSafe(name, version) {
  const [major, minor, patch] = versionParts(version);
  const minimum = MINIMUMS[name]?.[major];
  if (!minimum) return false; // Unknown major: do not guess its safety.
  const [minMajor, minMinor, minPatch] = versionParts(minimum);
  return major === minMajor && (minor > minMinor || (minor === minMinor && patch >= minPatch));
}

function inspectNpmCli(root) {
  const npmPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (npmPkg.name !== "npm") throw new Error("This is not an npm CLI install");
  const found = Object.fromEntries(Object.keys(MINIMUMS).map(k => [k, []]));
  let visited = 0;
  function walk(dir, depth) {
    if (depth > 35 || ++visited > 20000) throw new Error("npm install tree exceeds review limits");
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue; // no traversal of linked directories
      if (entry.name === ".bin" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (Object.hasOwn(MINIMUMS, entry.name)) {
        const manifestPath = path.join(full, "package.json");
        if (!fs.existsSync(manifestPath)) {
          throw new Error("Missing manifest for bundled " + entry.name + " in " + full);
        }
        const info = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        found[entry.name].push({ version: info.version, directory: full });
      }
      walk(full, depth + 1);
    }
  }
  walk(path.join(root, "node_modules"), 0);
  const problems = [];
  for (const [name, records] of Object.entries(found)) {
    if (records.length === 0) problems.push("Missing bundled " + name + "; verify the scan root.");
    for (const record of records) {
      if (!isSafe(name, record.version)) {
        problems.push(name + "@" + record.version + " is below a reviewed safe version (" + record.directory + ")");
      }
    }
  }
  return { version: npmPkg.version, found, problems };
}

if (require.main === module) {
  try {
    const root = execFileSync("npm", ["root", "--global"], { encoding: "utf8" }).trim();
    const result = inspectNpmCli(path.join(root, "npm"));
    console.log("Inspected global npm CLI " + result.version);
    for (const [name, records] of Object.entries(result.found)) {
      console.log(name + ": " + records.map(r => r.version).join(", "));
    }
    if (result.problems.length) {
      for (const issue of result.problems) console.error("UNSAFE npm CLI bundle: " + issue);
      console.error("Advisories: GHSA-qhr7-859c-m2p7 and npm/cli#10062; project npm audit is insufficient.");
      process.exitCode = 1;
    } else {
      console.log("PASS: observed npm CLI bundled dependency versions meet reviewed thresholds.");
    }
  } catch (err) {
    console.error("FAIL-CLOSED npm CLI bundle check: " + err.message);
    process.exitCode = 1;
  }
}

module.exports = { inspectNpmCli, isSafe };
