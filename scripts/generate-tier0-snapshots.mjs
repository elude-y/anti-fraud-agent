import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const browsers = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const browser = browsers.find(existsSync);
if (!browser) throw new Error("Chrome or Edge is required to render Tier0 snapshots");

const fixture = pathToFileURL(resolve("scripts/fixtures/tier0-snapshot.html")).href;
const outputDirectory = resolve("public");
mkdirSync(outputDirectory, { recursive: true });

for (const brand of ["bank", "etc", "express", "unknown", "safe"]) {
  const output = resolve(outputDirectory, `tier0-${brand}-snapshot.png`);
  const result = spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--window-size=1280,800",
    `--screenshot=${output}`,
    `${fixture}?brand=${brand}`,
  ], { stdio: "inherit", windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`Failed to render ${brand} snapshot`);
  }
  console.log(output);
}
