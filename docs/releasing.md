# Releasing Regards

For maintainers. A release is a set of installers on a GitHub release, built by the [Release workflow](../.github/workflows/release.yml) from a version tag.

## What a bundle holds

Each installer contains:
- **The app** (`regards-desktop`, the Tauri shell around the React UI);
- **The `regards` program:** the daemon, the CLI and the MCP server.

The app starts the daemon from the `regards` next to its own executable (`regards_ipc::launcher::sibling_program`). Tauri puts it there as a *sidecar*:
- `npm run release` builds with [`tauri.release.json`](../apps/desktop/src-tauri/tauri.release.json) over the usual configuration.
- [`scripts/sidecar.mjs`](../apps/desktop/scripts/sidecar.mjs) first builds `regards` for the target, and places it where Tauri expects it: `src-tauri/binaries/regards-<target triple>`, which is git-ignored.

- [`scripts/licences.mjs`](../apps/desktop/scripts/licences.mjs) writes the third-party licence list that Support › Licences shows. It runs [cargo-about](https://github.com/EmbarkStudios/cargo-about) with the root [`about.toml`](../about.toml), and puts the result in `public/licences/rust.json`, which is git-ignored. A release needs cargo-about (`cargo install cargo-about --version =0.9.2 --locked --features cli`), and the workflow installs it.
- [`scripts/licences-npm.mjs`](../apps/desktop/scripts/licences-npm.mjs) does the same for the web packages the window ships (the production npm dependencies, as installed), into `public/licences/npm.json`, also git-ignored. It needs nothing beyond npm.

Development builds don't need any of this: Cargo builds `regards` into the same folder as the app, and without cargo-about the licence list is empty.

## Cutting a release

1. **Set the version** in three places, all the same:
   - `version` in the root `Cargo.toml`;
   - `apps/desktop/package.json`;
   - `apps/desktop/src-tauri/tauri.conf.json`.

   Commit through a pull request, as usual. CI fails when they differ ([`scripts/check-version.mjs`](../apps/desktop/scripts/check-version.mjs)).
2. **Tag the merged commit** `v<version>`, for example `git tag v0.1.0 && git push origin v0.1.0`. The workflow then:
   - checks that the tag matches the version;
   - creates a **draft** release;
   - builds:
     - **Windows, x64 and ARM64:** the NSIS installer, one for each. Its [hooks](../apps/desktop/src-tauri/windows/hooks.nsh) run `regards daemon stop` before files are replaced or removed, because in background mode the daemon keeps running, and Windows won't replace a running program. An MSI would need the same, so none is built. The installer speaks English and French, and follows the language of Windows;
     - **macOS:** Apple silicon and Intel, as DMG;
     - **Linux, x64 and ARM64:** deb, rpm and AppImage, built on Ubuntu 22.04 so they run on more systems;

     Each is built on a runner of its own kind, nothing is cross-compiled. The ARM64 builds for Windows and Linux are built and packaged like the others, but no maintainer has such a computer: they are published untested;
   - uploads the bundles to the draft, each with its update signature (`.sig`), and for macOS the packed app an installed copy updates from (`.app.tar.gz`);
   - writes the update manifest, `latest.json`, and uploads it too (see [Updates](#updates)).

   It can also be started by hand (*Run workflow*) for an existing tag.
3. **Try the installers**, at least on one system, then publish the draft. Nothing is published before that.
4. **Read the website** ([`website/`](../website/README.md)) against this release. The version and the download buttons follow by themselves; the words do not. Change both languages wherever the page no longer says what the release does: features, installers, signing, updates.

Between releases, a pull request that changes what goes into the installers (the Tauri configuration, the installer hooks, the release scripts, the dependencies, the workflows) builds them in [CI](../.github/workflows/ci.yml), as a release does, and checks that the update files are there. Nothing from it is kept.

To build one bundle locally: `cd apps/desktop && npm run release`, optionally with `-- --bundles nsis` (or `dmg`, `deb` …) for a single format.

## Checking where a download was built

For every installer and package, the workflow records a *build attestation*: a signed statement, kept by GitHub, that the file was built by this repository's Release workflow from that tag. It applies on every system, signed or not. With the [GitHub CLI](https://cli.github.com):

```
gh attestation verify Regards_0.4.0_x64-setup.exe --repo lucienPochon/regards
```

It fails for a file that was changed, or built anywhere else. Releases up to 0.3.0 have no attestation.

**When Windows code signing arrives:** signing changes the installer, so it has to be attested after it is signed.

## Not yet

- **Signing:**
  - Windows: through the SignPath Foundation, free for open source ([code signing policy](code-signing.md)). Applied for; the signing steps in the workflow come once the project is accepted.
  - macOS: Developer ID and notarisation need the Apple Developer Program ($99 a year), so not for now. The app is signed *ad hoc* (`bundle.macOS.signingIdentity` is `-`): it names no one and Gatekeeper still warns, but without it macOS calls a downloaded app damaged.

  Until then, Windows SmartScreen and macOS Gatekeeper warn on first start.

## Updates

In the app (`apps/desktop/src-tauri/src/updates.rs`):
- **Asked once:** the app asks the person whether to check for updates. It doesn't check until they say yes, because a check tells GitHub the computer's address ([privacy](privacy.md)).
- **When on:** it asks GitHub's API for the latest release once a day.
- **When there is a later version:** a later release (not a draft or pre-release, with a page in this repository) is told once, by a notification and the `update_available` event.
- **Installing it:** in Settings › About, *Install and restart* downloads the new version, checks its signature, installs it and starts Regards again. This is [Tauri's updater](https://v2.tauri.app/plugin/updater/), used from Rust only. Nothing is downloaded before the person asks. If installing fails, or in a copy that can't replace itself (a development build), *Download* opens the release page instead.

Publishing a release (above) is all it takes for installed copies to learn of it and install it. Versions up to 0.3.0 have no updater: they are told of a later version, and the person downloads it.

### How an installed copy finds the files

It reads `latest.json` from the latest published release (`plugins.updater.endpoints` in [`tauri.conf.json`](../apps/desktop/src-tauri/tauri.conf.json)). The Release workflow writes that file with [`scripts/update-manifest.mjs`](../apps/desktop/scripts/update-manifest.mjs): the version, and for each system the file to download and its signature.

| An installed copy from | Updates from |
| --- | --- |
| The Windows installer | The same installer, `…_x64-setup.exe` or `…_arm64-setup.exe`, run without questions |
| A macOS DMG | The packed app, `…_aarch64.app.tar.gz` or `…_x64.app.tar.gz` |
| The AppImage | The new AppImage, for the same processor |
| The .deb or .rpm | The new package, for the same processor; the system asks for the administrator password |

A release whose `latest.json` is missing is still announced, but can't be installed from the app.

### The update key

Update files are signed with a key pair made for this (`npm run tauri signer generate`); it has nothing to do with Windows code signing.
- **The public key** is in `tauri.conf.json` (`plugins.updater.pubkey`). An installed copy refuses any file the private key didn't sign.
- **The private key** is the repository secret `TAURI_SIGNING_PRIVATE_KEY`, with `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if it has a password. The owner keeps a copy outside the repository. The workflow stops when the secret is missing.
- **Don't lose it, and don't change it.** Installed copies only trust that key: with another one, they can't update by themselves any more, and everyone has to download an installer by hand once.

The workflow builds with [`tauri.updater.json`](../apps/desktop/src-tauri/tauri.updater.json) on top of the release configuration, which makes the signatures. A local `npm run release` doesn't, so it needs no key. To make them locally, set `TAURI_SIGNING_PRIVATE_KEY` (the key, or the path of its file) and run `npm run release -- --config src-tauri/tauri.updater.json`.

**When Windows code signing arrives:** signing the installer changes the file, so its update signature has to be made after that, from the signed installer (`npm run tauri signer sign`), before `latest.json` is written.

A fork's build can point elsewhere: `REGARDS_RELEASES_API` and `REGARDS_RELEASE_PAGES` at build time for the check, and its own `plugins.updater` endpoint and key for installing.
