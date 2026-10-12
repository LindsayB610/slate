import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const userRoot = ["/", "Users", "/"].join("");
const cases = [
  ["README placeholders pass", "README.md", `${userRoot}you/Documents/notes.md ${userRoot}you/Documents/notes/`, true],
  ["real user paths fail", "README.md", `${userRoot}someone/Documents/notes.md`, false],
  ["mixed placeholder and real paths fail", "README.md", `${userRoot}you/notes.md ${userRoot}someone/notes.md`, false],
  ["similar usernames fail", "README.md", `${userRoot}you-person/notes.md`, false],
  ["placeholder outside README fails", "example.md", `${userRoot}you/notes.md`, false],
  ["private workspace still fails", "README.md", ["workshop", "-private"].join(""), false],
  ["private key still fails", "README.md", ["BEGIN ", "PRIVATE KEY"].join(""), false],
];

for (const [name, file, contents, passes] of cases) {
  test(name, () => {
    const root = mkdtempSync(join(tmpdir(), "slate-boundary-test-"));
    try {
      mkdirSync(join(root, "scripts"));
      copyFileSync(new URL("./public-boundary-scan.mjs", import.meta.url), join(root, "scripts/public-boundary-scan.mjs"));
      const initialized = spawnSync("git", ["init", "--quiet", root], { encoding: "utf8" });
      assert.equal(initialized.status, 0, initialized.stderr);
      writeFileSync(join(root, file), contents);
      const result = spawnSync(process.execPath, [join(root, "scripts/public-boundary-scan.mjs")], { encoding: "utf8" });
      assert.equal(result.status, passes ? 0 : 1, result.stderr);
      assert.match(passes ? result.stdout : result.stderr, passes ? /scan passed/ : /scan failed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
