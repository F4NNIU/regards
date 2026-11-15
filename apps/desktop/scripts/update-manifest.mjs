// Writes `latest.json`, the file an installed Regards reads to update itself
// (Tauri's updater, `src-tauri/src/updates.rs`): the version, and for each
// system the file to download and its signature. The Release workflow runs
// it over the signatures (`*.sig`) of a release's files, and uploads the
// result to the same release.
//
//   node scripts/update-manifest.mjs <folder of .sig files> <version> <download address>
//
// The download address is where the release's files are, for example
// https://github.com/lucienPochon/regards/releases/download/v0.4.0

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A release file's name, and what the updater calls the copies it is for:
// `<system>-<processor>-<kind of installer>`, then `<system>-<processor>`.
// On Linux only the AppImage also takes the short name: a copy that came
// from a .deb or .rpm asks for its own kind first.
const FILES = [
  [/_x64-setup\.exe$/, ["windows-x86_64-nsis", "windows-x86_64"]],
  [/_arm64-setup\.exe$/, ["windows-aarch64-nsis", "windows-aarch64"]],
  [/_aarch64\.app\.tar\.gz$/, ["darwin-aarch64-app", "darwin-aarch64"]],
  [/_x64\.app\.tar\.gz$/, ["darwin-x86_64-app", "darwin-x86_64"]],
  [/_amd64\.AppImage$/, ["linux-x86_64-appimage", "linux-x86_64"]],
  [/_amd64\.deb$/, ["linux-x86_64-deb"]],
  [/\.x86_64\.rpm$/, ["linux-x86_64-rpm"]],
  [/_aarch64\.AppImage$/, ["linux-aarch64-appimage", "linux-aarch64"]],
  [/_arm64\.deb$/, ["linux-aarch64-deb"]],
  [/\.aarch64\.rpm$/, ["linux-aarch64-rpm"]],
];
// Without these, some installed copies could not update: no manifest then.
const REQUIRED = [
  "windows-x86_64",
  "windows-aarch64",
  "darwin-aarch64",
  "darwin-x86_64",
  "linux-x86_64",
  "linux-aarch64",
];

/**
 * The manifest for `version`, from the signatures: `{ "<file>.sig": "<its text>" }`.
 * Throws when a system's file is missing, or when two files are for the same one.
 */
export function manifest(signatures, version, base, published = new Date()) {
  const platforms = {};
  for (const [name, signature] of Object.entries(signatures).sort(([a], [b]) => a.localeCompare(b))) {
    const file = name.replace(/\.sig$/, "");
    const targets = FILES.find(([pattern]) => pattern.test(file))?.[1];
    if (!targets) continue;
    for (const target of targets) {
      if (platforms[target]) throw new Error(`two files for ${target}: ${platforms[target].url} and ${file}`);
      platforms[target] = { signature: signature.trim(), url: `${base.replace(/\/$/, "")}/${encodeURIComponent(file)}` };
    }
  }
  const missing = REQUIRED.filter((target) => !platforms[target]);
  if (missing.length) throw new Error(`no signed file for ${missing.join(", ")}`);
  return { version: version.replace(/^v/, ""), pub_date: published.toISOString(), platforms };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [folder, version, base] = process.argv.slice(2);
  if (!folder || !version || !base) {
    console.error("usage: update-manifest.mjs <folder of .sig files> <version> <download address>");
    process.exit(2);
  }
  const signatures = Object.fromEntries(
    readdirSync(folder)
      .filter((name) => name.endsWith(".sig"))
      .map((name) => [name, readFileSync(join(folder, name), "utf8")]),
  );
  try {
    console.log(JSON.stringify(manifest(signatures, version, base), null, 2));
  } catch (error) {
    console.error(`update manifest: ${error.message}`);
    process.exit(1);
  }
}
