import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publish } from "./publish.ts";

const pkg = { name: "pi-actor-subagents", version: "0.1.0" };
const integrity = "sha512-test-tarball";

function fakeNpm(options: { existing?: string; latest?: string; error?: Error } = {}) {
  const calls: string[][] = [];
  const npm = (args: string[]): string => {
    calls.push(args);
    if (args[0] === "pack") {
      return JSON.stringify([{ filename: `${pkg.name}-0.1.42.tgz`, integrity }]);
    }
    if (args[0] === "view") {
      if (options.error) throw options.error;
      const value = args[2] === "dist.integrity" ? options.existing : options.latest;
      if (value === undefined) {
        throw Object.assign(new Error("Not found"), { stdout: '{"error":{"code":"E404"}}' });
      }
      return JSON.stringify(value);
    }
    return "ok";
  };
  return { npm, calls };
}

test("publishes the single packed tarball as latest with a CI-only version", () => {
  const { npm, calls } = fakeNpm({ latest: "0.1.41" });
  publish(pkg, "42", npm);
  assert.deepEqual(calls, [
    ["version", "0.1.42", "--no-git-tag-version", "--ignore-scripts"],
    ["pack", "--json", "--ignore-scripts"],
    ["view", `${pkg.name}@0.1.42`, "dist.integrity", "--json"],
    ["view", pkg.name, "version", "--json"],
    ["publish", `${pkg.name}-0.1.42.tgz`, "--tag", "latest", "--access", "public", "--ignore-scripts"],
  ]);
});

test("publishes a first version when the package does not exist yet", () => {
  const { npm, calls } = fakeNpm();
  publish(pkg, "42", npm);
  assert.equal(calls.at(-1)?.[3], "latest");
});

test("older queued releases cannot move latest backwards", () => {
  for (const latest of ["0.1.100", "0.2.1", "1.0.1"]) {
    const { npm, calls } = fakeNpm({ latest });
    publish(pkg, "42", npm);
    assert.equal(calls.at(-1)?.[3], "snapshot");
  }
});

test("comparison is numeric and honors intentional major/minor bumps", () => {
  for (const [base, latest] of [["0.1.0", "0.1.9"], ["0.2.0", "0.1.999"], ["1.0.0", "0.9.999"]]) {
    const { npm, calls } = fakeNpm({ latest });
    publish({ ...pkg, version: base }, "42", npm);
    assert.equal(calls.at(-1)?.[3], "latest");
  }
});

test("rerunning identical published contents is a no-op", () => {
  const { npm, calls } = fakeNpm({ existing: integrity });
  publish(pkg, "42", npm);
  assert.deepEqual(calls.map((args) => args[0]), ["version", "pack", "view"]);
});

test("version collisions with different contents stop the release", () => {
  const { npm, calls } = fakeNpm({ existing: "sha512-different" });
  assert.throws(() => publish(pkg, "42", npm), /different contents/);
  assert.ok(!calls.some((args) => args[0] === "publish"));
});

test("registry errors other than a structured 404 stop the release", () => {
  for (const code of ["E401", "E403", "E500", "ECONNRESET"]) {
    const error = Object.assign(new Error(code), { stdout: JSON.stringify({ error: { code } }) });
    const { npm, calls } = fakeNpm({ error });
    assert.throws(() => publish(pkg, "42", npm), (result) => result === error);
    assert.ok(!calls.some((args) => args[0] === "publish"));
  }
});

test("non-JSON npm errors preserve the original failure", () => {
  for (const stdout of [undefined, "", "network unavailable", "null"]) {
    const error = Object.assign(new Error("npm failed"), { stdout });
    const { npm, calls } = fakeNpm({ error });
    assert.throws(() => publish(pkg, "42", npm), (result) => result === error);
    assert.ok(!calls.some((args) => args[0] === "publish"));
  }
});

test("invalid versions and counters fail before running npm", () => {
  for (const version of ["0.1.2", "0.1.0-next", "01.1.0", "9007199254740992.1.0"]) {
    const { npm, calls } = fakeNpm();
    assert.throws(() => publish({ ...pkg, version }, "42", npm));
    assert.equal(calls.length, 0);
  }
  for (const run of ["", "0", "-1", "1.2", "01", "9007199254740992"]) {
    const { npm, calls } = fakeNpm();
    assert.throws(() => publish(pkg, run, npm));
    assert.equal(calls.length, 0);
  }
});

test("unexpected latest metadata cannot silently choose a release tag", () => {
  const { npm, calls } = fakeNpm({ latest: "0.2.0-next.1" });
  assert.throws(() => publish(pkg, "42", npm), /stable npm version/);
  assert.ok(!calls.some((args) => args[0] === "publish"));
});

test("the command refuses unintended contexts without changing package.json", () => {
  const before = readFileSync("package.json", "utf8");
  const valid = {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "fdietze/pi-actor-subagents",
  };
  for (const [invalid, message] of [
    [{ GITHUB_ACTIONS: "false" }, /requires GitHub Actions/],
    [{ GITHUB_EVENT_NAME: "pull_request" }, /requires a push/],
    [{ GITHUB_REF: "refs/heads/feature" }, /Only main is published/],
    [{ GITHUB_REPOSITORY: "other/pi-actor-subagents" }, /Unexpected repository/],
  ] as const) {
    assert.throws(() => execFileSync(process.execPath, ["scripts/publish.ts"], {
      env: { ...process.env, ...valid, ...invalid },
      stdio: "pipe",
    }), message);
    assert.equal(readFileSync("package.json", "utf8"), before);
  }
});
