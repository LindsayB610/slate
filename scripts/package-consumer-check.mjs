import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const temporaryRoot = mkdtempSync(join(tmpdir(), "slate-package-check-"));
try {
  const packed = spawnSync(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryRoot],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: join(temporaryRoot, "npm-cache") },
    },
  );
  if (packed.status !== 0) throw new Error(packed.stderr || "Slate package could not be created.");
  const [{ filename }] = JSON.parse(packed.stdout);
  const archive = join(temporaryRoot, filename);
  const contents = spawnSync("tar", ["-tf", archive], { encoding: "utf8" });
  if (contents.status !== 0) throw new Error(contents.stderr || "Slate package could not be inspected.");
  const files = contents.stdout.split("\n").filter(Boolean);
  for (const required of ["package/package.json", "package/README.md", "package/LICENSE", "package/dist/index.js", "package/dist/index.d.ts", "package/dist/themeContract.js"]) {
    if (!files.includes(required)) throw new Error(`Slate package is missing ${required}.`);
  }
  if (files.some((file) => file.startsWith("package/src/") || file.startsWith("package/tests/"))) {
    throw new Error("Slate package leaked source or test files.");
  }
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  if (manifest.exports?.["."]?.default !== "./dist/index.js") throw new Error("Slate package export is not consumer-ready.");
  console.log(`Slate package consumer check passed (${files.length} packaged files).`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
