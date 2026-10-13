import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

type Npm = (args: string[]) => string;

function versionParts(version: string): number[] {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Expected a stable npm version");
  const parts = version.split(".").map(Number);
  assert.ok(parts.every(Number.isSafeInteger), "Version components must be safe integers");
  return parts;
}

function published(npm: Npm, spec: string, field: string): string | undefined {
  let output: string;
  try {
    output = npm(["view", spec, field, "--json"]);
  } catch (error) {
    // Parse, Don't Validate: only a structured registry 404 means absence.
    // Authentication, network and other registry failures stop the release.
    if (error && typeof error === "object" && "stdout" in error) {
      let code: unknown;
      try {
        code = JSON.parse(String(error.stdout)).error?.code;
      } catch {
        // Preserve the original subprocess error when npm did not return JSON.
      }
      if (code === "E404") return undefined;
    }
    throw error;
  }
  const value: unknown = JSON.parse(output);
  assert.equal(typeof value, "string", `Expected ${field} for ${spec}`);
  return value as string;
}

// The workflow serializes this entire operation, including the registry reads.
// KISS: the workflow counter supplies versions without Git writes or a release framework.
export function publish(pkg: { name: string; version: string }, runNumber: string, npm: Npm): void {
  const base = versionParts(pkg.version);
  assert.equal(base[2], 0, "The repository version must end in .0; CI supplies the patch number");
  assert.match(runNumber, /^[1-9]\d*$/, "Expected GITHUB_RUN_NUMBER");
  assert.ok(Number.isSafeInteger(Number(runNumber)), "Run number must be a safe integer");
  const version = `${base[0]}.${base[1]}.${runNumber}`;

  npm(["version", version, "--no-git-tag-version", "--ignore-scripts"]);
  // Pack exactly once and publish those bytes; reruns must match their integrity.
  const packs = JSON.parse(npm(["pack", "--json", "--ignore-scripts"]));
  assert.equal(packs.length, 1, "Expected exactly one npm tarball");
  const { filename, integrity } = packs[0];
  assert.equal(typeof filename, "string");
  assert.equal(typeof integrity, "string");
  const existing = published(npm, `${pkg.name}@${version}`, "dist.integrity");
  if (existing !== undefined) {
    assert.equal(existing, integrity, `Version ${version} already exists with different contents`);
    console.log(`${pkg.name}@${version} is already published with identical contents`);
    return;
  }

  const latest = published(npm, pkg.name, "version");
  const latestParts = latest === undefined ? [0, 0, 0] : versionParts(latest);
  const nextParts = versionParts(version);
  const difference = nextParts.map((part, index) => part - latestParts[index]).find((part) => part !== 0) ?? 0;
  // FIFO follows queue arrival, not push order. Older runs still get a version,
  // but use a separate dist-tag so they cannot move `latest` backwards.
  const tag = difference > 0 ? "latest" : "snapshot";
  console.log(npm(["publish", filename, "--tag", tag, "--access", "public", "--ignore-scripts"]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "CI publishing requires GitHub Actions");
  assert.equal(process.env.GITHUB_EVENT_NAME, "push", "CI publishing requires a push");
  assert.equal(process.env.GITHUB_REF, "refs/heads/main", "Only main is published");
  assert.equal(process.env.GITHUB_REPOSITORY, "fdietze/pi-actor-subagents", "Unexpected repository");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  publish(pkg, process.env.GITHUB_RUN_NUMBER ?? "", (args) =>
    execFileSync("npm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }),
  );
}
