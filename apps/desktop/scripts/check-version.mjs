// A release sets Regards' version in three files (docs/releasing.md), and
// npm writes it to a fourth. CI runs this so they never differ: the Release
// workflow would only refuse the tag, on release day.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const text = (path) => readFileSync(join(root, path), "utf8");
const json = (path) => JSON.parse(text(path)).version;

const found = {
  "Cargo.toml": /^\[workspace\.package\]\s+version = "([^"]+)"/m.exec(text("Cargo.toml"))?.[1],
  "apps/desktop/package.json": json("apps/desktop/package.json"),
  "apps/desktop/package-lock.json": json("apps/desktop/package-lock.json"),
  "apps/desktop/src-tauri/tauri.conf.json": json("apps/desktop/src-tauri/tauri.conf.json"),
};
for (const [file, version] of Object.entries(found)) console.log(`${version ?? "none"}  ${file}`);
if (new Set(Object.values(found)).size !== 1 || !found["Cargo.toml"]) {
  console.error("::error::Regards' version differs between these files");
  process.exit(1);
}
