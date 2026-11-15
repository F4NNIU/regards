// Builds the website into website/dist: one page per language, from the same
// layout, styles and script. No dependencies: `node website/build.mjs`.
//
// - The version shown is the workspace's (Cargo.toml), so the page follows
//   each release without an edit.
// - Download buttons fetch the installer itself, from the GitHub release of
//   that version. Until that release is published (it starts as a draft),
//   they go to the releases page instead: the build asks GitHub for each file.
// - The languages must stay in step: the build fails when a page's elements
//   differ from the English page's, so a section added in one language is
//   not forgotten in the other.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { speedPage } from "./speed.mjs";

const here = import.meta.dirname;
const out = join(here, "dist");
const read = (...parts) => readFileSync(join(here, ...parts), "utf8");

// The site's address: SITE_URL when given, else the Vercel project's
// production domain (set by Vercel during its builds), else the default.
const DEFAULT_SITE = "https://regards-two.vercel.app";
const onVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site = (process.env.SITE_URL || (onVercel ? `https://${onVercel}` : DEFAULT_SITE)).replace(/\/$/, "");
const releases = "https://github.com/lucienPochon/regards/releases/latest";
const version = readFileSync(join(here, "..", "Cargo.toml"), "utf8")
  .match(/\[workspace\.package\][^[]*?^version = "([^"]+)"/ms)?.[1];
if (!version) throw new Error("no workspace version in Cargo.toml");

// The installers of this version, as the release workflow names them.
const files = {
  dl_windows: `Regards_${version}_x64-setup.exe`,
  dl_mac_arm: `Regards_${version}_aarch64.dmg`,
  dl_mac_intel: `Regards_${version}_x64.dmg`,
  dl_deb: `Regards_${version}_amd64.deb`,
  dl_rpm: `Regards-${version}-1.x86_64.rpm`,
  dl_appimage: `Regards_${version}_amd64.AppImage`,
};
// The ARM64 ones, which releases up to 0.3.0 do not have: their links are
// left out of the page ({{…_off}}) until the release that has them is out.
const armFiles = {
  dl_windows_arm: `Regards_${version}_arm64-setup.exe`,
  dl_deb_arm: `Regards_${version}_arm64.deb`,
  dl_rpm_arm: `Regards-${version}-1.aarch64.rpm`,
  dl_appimage_arm: `Regards_${version}_aarch64.AppImage`,
};
/** The file's own address when GitHub has it (it answers with a redirect to the file), else the releases page. */
async function download(name) {
  const url = `https://github.com/lucienPochon/regards/releases/download/v${version}/${name}`;
  try {
    const answer = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) });
    if (answer.status === 302 || answer.ok) return url;
    console.warn(`${name}: not published (${answer.status}), linking to the releases page`);
  } catch (error) {
    console.warn(`${name}: could not ask GitHub (${error.message}), linking to the releases page`);
  }
  return releases;
}
const downloads = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, name]) => [key, await download(name)])),
);
for (const [key, name] of Object.entries(armFiles)) {
  const url = await download(name);
  downloads[key] = url;
  downloads[`${key}_off`] = url === releases ? " hidden" : "";
}

/** A page's elements, without its words: tag names, ids and classes, in order. */
function shape(html) {
  return [...html.matchAll(/<(\/?)([a-z][a-z0-9]*)([^>]*)>/g)].map(([, close, tag, rest]) => {
    const id = rest.match(/\bid="([^"]*)"/)?.[1] ?? "";
    const cls = rest.match(/\bclass="([^"]*)"/)?.[1] ?? "";
    return `${close}${tag}#${id}.${cls}`;
  });
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const fill = (text, values) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`nothing to put in {{${key}}}`);
    return values[key];
  });

const layout = read("src", "layout.html");
const pages = JSON.parse(read("src", "pages.json"));
const english = shape(read("src", "en.html"));

rmSync(out, { recursive: true, force: true });
for (const [lang, page] of Object.entries(pages)) {
  const body = read("src", `${lang}.html`);
  const elements = shape(body);
  const at = elements.findIndex((element, i) => element !== english[i]);
  if (at !== -1 || elements.length !== english.length) {
    const where = at === -1 ? Math.min(elements.length, english.length) : at;
    throw new Error(
      `${lang}.html is out of step with en.html at element ${where}: ` +
        `${elements[where] ?? "(nothing)"} where English has ${english[where] ?? "(nothing)"}`,
    );
  }
  const root = page.path ? "../".repeat(page.path.split("/").filter(Boolean).length) : "";
  const shared = { version, releases, ...downloads, root, site, shots: page.shots ?? "" };
  const html = fill(layout, {
    ...shared,
    alt_en: `${site}/`,
    alt_fr: `${site}/fr/`,
    lang,
    locale: page.locale,
    url: `${site}/${page.path}`,
    title: escape(page.title),
    description: escape(page.description),
    other_lang: page.other_lang,
    other_href: page.other_href,
    other_text: escape(page.other_text),
    body: fill(body, shared),
  });
  mkdirSync(join(out, page.path), { recursive: true });
  writeFileSync(join(out, page.path, "index.html"), html);
  console.log(`${lang}: dist/${page.path}index.html`);
}

// The blog: src/blog/posts.json lists the articles, newest first. Each has
// its text in src/blog/<slug>.en.html and <slug>.fr.html, which must have the
// same elements, like the pages. They are published at /blog/<slug>/ and
// /fr/blog/<slug>/, with an index of all of them at /blog/ and /fr/blog/.
const frame = read("src", "blog", "frame.html");
const words = JSON.parse(read("src", "blog", "words.json"));
const posts = JSON.parse(read("src", "blog", "posts.json"));
const day = (date, lang) =>
  new Intl.DateTimeFormat(lang === "fr" ? "fr-CH" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
function blogPage(lang, path, depth, title, description, content) {
  const prefix = lang === "fr" ? "fr/" : "";
  const root = "../".repeat(depth + (lang === "fr" ? 1 : 0));
  const shared = { version, releases, ...downloads, root, site, shots: lang === "fr" ? "-fr" : "", home: `${root}${prefix}` || "./", blog: `${root}${prefix}blog/`, speed: `${root}${prefix}speed/`, ...Object.fromEntries(Object.entries(words[lang]).map(([key, text]) => [key, fill(text, { version })])) };
  const other = lang === "fr" ? "en" : "fr";
  const html = fill(layout, {
    ...shared,
    alt_en: `${site}/${path}`,
    alt_fr: `${site}/fr/${path}`,
    lang,
    locale: lang,
    url: `${site}/${prefix}${path}`,
    title: escape(title),
    description: escape(description),
    other_lang: other,
    other_href: `${root}${other === "fr" ? "fr/" : ""}${path}`,
    other_text: escape(words[lang].other_text),
    body: fill(frame, {
      ...shared,
      en_href: `${root}${path}`,
      fr_href: `${root}fr/${path}`,
      en_current: lang === "en" ? ' aria-current="true"' : "",
      fr_current: lang === "fr" ? ' aria-current="true"' : "",
      blog_current: path.startsWith("blog/") ? ' aria-current="page"' : "",
      speed_current: path.startsWith("speed/") ? ' aria-current="page"' : "",
      content: fill(content, shared),
    }),
  });
  mkdirSync(join(out, prefix, path), { recursive: true });
  writeFileSync(join(out, prefix, path, "index.html"), html);
}
for (const lang of ["en", "fr"]) {
  const w = words[lang];
  for (const post of posts) {
    const body = read("src", "blog", `${post.slug}.${lang}.html`);
    const mine = shape(body);
    const theirs = shape(read("src", "blog", `${post.slug}.en.html`));
    const at = mine.findIndex((element, i) => element !== theirs[i]);
    if (at !== -1 || mine.length !== theirs.length) {
      const where = at === -1 ? Math.min(mine.length, theirs.length) : at;
      throw new Error(
        `blog/${post.slug}.${lang}.html is out of step with the English at element ${where}: ` +
          `${mine[where] ?? "(nothing)"} where English has ${theirs[where] ?? "(nothing)"}`,
      );
    }
    const text = post[lang];
    const content =
      `<header class="phead"><div class="wrap"><span class="kick">${escape(text.kicker)} · <time datetime="${post.date}">${day(post.date, lang)}</time></span>` +
      `<h1>${text.heading}</h1><p>${escape(text.description)}</p></div></header>\n` +
      `<article class="post">\n${body}\n<p class="back"><a href="{{blog}}">${escape(w.all_posts)}</a></p>\n</article>`;
    blogPage(lang, `blog/${post.slug}/`, 2, `${text.title} · Regards`, text.description, content);
  }
  const cards = posts
    .map(
      (post) =>
        `<a class="pcard" href="{{blog}}${post.slug}/"><span class="kick">${escape(post[lang].kicker)} · <time datetime="${post.date}">${day(post.date, lang)}</time></span>` +
        `<h2>${escape(post[lang].title)}</h2><p>${escape(post[lang].description)}</p><b>${escape(w.read)}</b></a>`,
    )
    .join("\n");
  const index =
    `<header class="phead"><div class="wrap"><span class="kick">${escape(w.blog_label)}</span><h1>${w.index_heading}</h1><p>${escape(w.index_description)}</p></div></header>\n` +
    `<div class="posts"><div class="wrap">\n${cards}\n</div></div>`;
  blogPage(lang, "blog/", 1, w.index_title, w.index_description, index);
  console.log(`${lang}: ${posts.length} articles`);
}
// The speed page: the same numbers in both languages (speed.mjs).
const speedData = JSON.parse(read("src", "speed", "data.json"));
const speedWords = JSON.parse(read("src", "speed", "words.json"));
for (const lang of ["en", "fr"]) {
  const page = speedPage(lang, speedWords[lang], speedData);
  blogPage(lang, "speed/", 1, page.title, page.description, page.content);
  console.log(`${lang}: speed page`);
}
cpSync(join(here, "assets"), join(out, "assets"), { recursive: true });
// GitHub Pages: serve the files as they are.
writeFileSync(join(out, ".nojekyll"), "");
console.log(`Regards ${version}, for ${site}`);
