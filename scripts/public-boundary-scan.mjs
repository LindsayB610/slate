import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const listed = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: new URL("..", import.meta.url), encoding: "utf8" },
);

if (listed.status !== 0) {
  throw new Error(listed.stderr || "Could not list Slate's public files.");
}

const excluded = new Set(["scripts/public-boundary-scan.mjs"]);
const privatePatterns = [
  { label: "absolute macOS user path", value: ["/", "Users", "/"].join("") },
  { label: "private workspace name", value: ["workshop", "-private"].join("") },
  { label: "private key material", value: ["BEGIN ", "PRIVATE KEY"].join("") },
];

const findings = [];
for (const file of listed.stdout.split("\n").filter(Boolean)) {
  if (excluded.has(file) || /\.(?:png|jpe?g|gif|ico|woff2?)$/i.test(file)) continue;
  const contents = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const pattern of privatePatterns) {
    if (contents.includes(pattern.value)) findings.push(`${file}: ${pattern.label}`);
  }
}

if (findings.length) {
  throw new Error(`Slate public-boundary scan failed:\n${findings.join("\n")}`);
}

console.log(`Slate public-boundary scan passed (${listed.stdout.split("\n").filter(Boolean).length} files).`);
