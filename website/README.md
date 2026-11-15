# The website

The public page that presents Regards, in English (`/`) and French (`/fr/`).
It is static: no framework, no dependencies, no requests to anyone but the
site itself (the fonts are in `assets/fonts`, under the SIL Open Font License).

```sh
node website/build.mjs      # writes website/dist
```

Open `website/dist/index.html` in a browser to see it.

- **`src/en.html`, `src/fr.html`:** the page in each language. They must have
  the same elements in the same order; the build fails, and says where, when
  they differ. Change both together.
- **`src/pages.json`:** each language's title and description.
- **`src/layout.html`:** the `<head>` both share.
- **`assets/`:** styles, script, fonts and the mark, copied as they are.

- **`src/blog/`:** the blog, at `/blog/` and `/fr/blog/`. `posts.json` lists
  the articles, newest first, with each one's date, title, heading and
  description in both languages. An article's text is in `<slug>.en.html` and
  `<slug>.fr.html`, which must have the same elements, like the pages.
  `frame.html` is the bar and the foot around every blog page, and
  `words.json` their words. To add an article: one entry in `posts.json`, two
  files. Numbers in an article come from `bench/results/` and say when and on
  what they were measured.

What the build fills in:

- `{{version}}`: the workspace version in `Cargo.toml`, so the page follows
  each release.
- `{{dl_windows}}`, `{{dl_mac_arm}}`, `{{dl_mac_intel}}`, `{{dl_deb}}`,
  `{{dl_rpm}}`, `{{dl_appimage}}`: the installer files of that version on its
  GitHub release, so a download button fetches the file itself. The build asks
  GitHub for each one; a file that is not published yet (the release is still
  a draft) links to the releases page instead, so deploy the site again once
  the release is published.
- `{{dl_windows_arm}}`, `{{dl_deb_arm}}`, `{{dl_rpm_arm}}`, `{{dl_appimage_arm}}`: the
  ARM64 installers, each with `{{…_off}}` inside its link's tag: the link is
  left out of the page (`hidden`) while its file is not published.
- `{{releases}}`: the latest GitHub release, the fallback above.

## Keep it true

The page says only what Regards does today, in step with `README.md` and
`docs/agents.md`. A pull request that changes what the page describes (a
feature, what agents can do, providers, platforms, installers, signing,
updates, the price) changes the page too, in both languages. At each release
the page is read again (`docs/releasing.md`).

## Publishing

The site is at <https://regards-two.vercel.app>, on Vercel (project `regards`).
`vercel.json` at the root of the repository says how it is built: no install,
`node website/build.mjs`, and `website/dist` served. `.vercelignore` keeps
everything but `website/` and `Cargo.toml` out of what is uploaded.

- **By hand:** `vercel deploy --prod` from the root of the repository, signed
  in to the project's Vercel account.
- **By itself:** the repository is connected to the project, so each merge
  to `main` is published. Only branches named `website/...` get a preview
  (a Vercel check on the pull request); pushes to any other branch deploy
  nothing (`git.deploymentEnabled` in `vercel.json`), so work on the app
  does not use Vercel builds. Name a branch `website/...` when it changes
  the page.

The canonical and language links use the project's production domain. With a
domain of its own, add it to the Vercel project and set `SITE_URL` there.

`.github/workflows/website.yml` only checks that the site builds.
