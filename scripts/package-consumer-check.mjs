import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  if (manifest.license !== "MIT") throw new Error("Slate package metadata must declare the MIT license.");

  const consumerRoot = join(temporaryRoot, "consumer");
  mkdirSync(consumerRoot);
  writeFileSync(join(consumerRoot, "package.json"), JSON.stringify({ private: true, type: "module" }));
  const installed = spawnSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive],
    {
      cwd: consumerRoot,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: join(temporaryRoot, "npm-cache") },
      timeout: 120_000,
    },
  );
  if (installed.status !== 0) throw new Error(installed.stderr || installed.error?.message || "A clean consumer could not install Slate.");

  const consumed = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'import { WorkshopToolView, slateViewFormats, workshopPluginDeclaration } from "slate-core";',
        'import { createElement } from "react";',
        'import { renderToStaticMarkup } from "react-dom/server";',
        'if (typeof WorkshopToolView !== "function") throw new Error("WorkshopToolView is not importable.");',
        'if (workshopPluginDeclaration?.id !== "slate") throw new Error("workshopPluginDeclaration is not importable.");',
        'if (!slateViewFormats?.includes("table-tabs")) throw new Error("Slate domain exports are not importable.");',
        'const markup = renderToStaticMarkup(createElement(WorkshopToolView, { requestWorkspaceRoot() {} }));',
        'if (!markup.includes("Connect a Slate folder")) throw new Error("WorkshopToolView cannot render from the packed artifact.");',
      ].join("\n"),
    ],
    { cwd: consumerRoot, encoding: "utf8" },
  );
  if (consumed.status !== 0) throw new Error(consumed.stderr || "A clean consumer could not import Slate's public API.");

  console.log(`Slate package consumer check passed: clean install, public API import, and view render (${files.length} packaged files).`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
