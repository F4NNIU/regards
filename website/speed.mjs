// The speed page (/speed/ and /fr/speed/). Both languages are written from the
// same numbers, src/speed/data.json: one row per app, as
// bench/compare-apps.ps1 reports it (times in ms, memory and sizes in MB, the
// first row is Regards). src/speed/words.json has each language's words.
// Every ratio, verdict and "best" mark is worked out here, so new results
// only change data.json.

const ICONS = [
  '<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  '<ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
];
const icon = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

/** The page in one language: its title, its description and its content. */
export function speedPage(lang, w, data) {
  const apps = data.apps;
  const me = apps[0];
  const put = (text, values) => text.replace(/\{(\w+)\}/g, (all, key) => (key in values ? values[key] : all));
  const dec = (value, digits) => value.toFixed(digits).replace(".", w.decimal);
  const secs = (ms) => `${dec(ms / 1000, 2)} s`;
  const mb = (value) => `${value} ${w.mb}`;
  const cpu = (value) => `${dec(value, 1)} s`;
  const pct = (value) => `${dec(value, 2)} %`;
  const sorted = (key) => [...apps].sort((a, b) => a[key] - b[key]);
  const times = (ratio) => `${ratio >= 3 ? Math.round(ratio) : dec(ratio, 1)}×`;
  const version = (app) => (typeof app.version === "string" ? app.version : app.version[lang]);
  const mine = (app) => (app === me ? ' class="me"' : "");
  const head = (kick, heading, text) =>
    `<div class="sp-head"><span class="kick">${kick}</span><h2>${heading}</h2>${text ? `<p>${text}</p>` : ""}</div>`;

  // The hero: Regards' own time, and how far ahead of the next app it is.
  const drawn = dec(me.drawn / 1000, 2);
  const wins = w.wins
    .map(([key, what]) => {
      const next = sorted(key).find((app) => app !== me);
      return `<div><strong>${times(next[key] / me[key])}</strong><b>${what}</b>${put(w.than, { name: next.name })}</div>`;
    })
    .join("");

  // The race: one lane per app, as long as its time. The page is written with
  // the race finished; the script runs it again at real speed.
  const slowest = Math.max(...apps.map((app) => app.drawn));
  const scale = Math.round(slowest * 1.045);
  const lanes = sorted("drawn")
    .map(
      (app) =>
        `<div class="sp-lane${app === me ? " me" : ""}" data-ms="${app.drawn}"><div class="sp-lh"><span><b>${app.name}</b><small>${version(app)}</small></span>` +
        `<span><em>${w.on}</em><code>${secs(app.drawn)}</code></span></div><div class="sp-track"><i style="--w:${((100 * app.drawn) / scale).toFixed(2)}%"></i></div></div>`,
    )
    .join("\n");
  const ticks = Array.from({ length: Math.floor(scale / 1000) + 1 }, (_, i) => `<span>${i ? `${i} s` : "0"}</span>`).join("");

  // The cards: Regards' number, who is next (or who wins), and every app.
  const verdict = (key, format) => {
    const order = sorted(key);
    return order[0] === me
      ? `<em>${put(w.less, { times: times(order[1][key] / me[key]), name: order[1].name })}</em>`
      : `<em class="lost">${put(w.lost, { name: order[0].name, value: format(order[0][key]) })}</em>`;
  };
  const cardHead = (key, value, unit, format) =>
    `<header><small>${w.cards[key]}</small><strong>${value}<small>${unit}</small></strong>${verdict(key, format)}</header>`;
  const card = (key, value, unit, format) => {
    const max = Math.max(...apps.map((app) => app[key]));
    const rows = sorted(key)
      .map((app) => `<div${mine(app)}>${app.name}<span><i style="--w:${Math.max(1, (66 * app[key]) / max).toFixed(1)}%"></i>${format(app[key])}</span></div>`)
      .join("");
    return `<div class="sp-panel sp-card">${cardHead(key, value, unit, format)}<div class="sp-rows">${rows}</div></div>`;
  };
  const largest = Math.max(...apps.map((app) => app.install));
  const squares = sorted("install")
    .map((app) => `<div${mine(app)}><i style="--s:${Math.round(120 * Math.sqrt(app.install / largest))}px"></i><b>${app.name}</b><small>${mb(app.install)}</small></div>`)
    .join("");

  // The table: every number, the best of each column marked.
  const columns = [["window", secs], ["drawn", secs], ["quiet", secs], ["cpu", cpu], ["ram", mb], ["idle", pct], ["procs", null], ["data", mb], ["install", mb]];
  const judged = columns.filter(([, format]) => format);
  const best = Object.fromEntries(judged.map(([key]) => [key, sorted(key)[0]]));
  const won = judged.filter(([key]) => best[key] === me).length;
  const rows = apps
    .map(
      (app) =>
        `<tr${mine(app)}><th scope="row">${app.name} <small>${version(app)}</small></th>` +
        columns.map(([key, format]) => (format ? `<td${best[key] === app ? ' class="best"' : ""}>${format(app[key])}</td>` : `<td>${app[key]}</td>`)).join("") +
        "</tr>",
    )
    .join("\n");

  const content = `<div class="sp">
<div class="sp-sec sp-hero"><div class="wrap">
  <p class="sp-tag"><b>${w.badge}</b>${w.tag}</p>
  <h1><span class="sp-lead">${w.lead}</span> <span class="sp-clock" aria-hidden="true"><span id="clock" data-ms="${me.drawn}">${drawn}</span><small>s</small></span><span class="sp-vh">${drawn} s</span></h1>
  <p class="sp-sub">${w.sub}</p>
  <div class="sp-wins">${wins}</div>
  <div class="sp-cta"><a class="btn glow" href="{{home}}#systems">${w.download}</a><a class="btn line" href="#race">${w.watch}</a></div>
  <div class="sp-panel sp-race" id="race" data-scale="${scale}" data-sep="${w.decimal}" data-on="${w.on}" data-off="${w.off}">
    <div class="sp-rh"><div><h2>${w.race_heading}</h2><p>${w.race_text}</p></div>
    <button class="sp-again" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${w.again}</button></div>
    <div class="sp-lanes" style="--tick:${(100000 / scale).toFixed(3)}%">
${lanes}
    <div class="sp-axis" aria-hidden="true">${ticks}</div>
    </div>
  </div>
</div></div>

<div class="sp-sec"><div class="wrap">
  ${head(w.why_kick, w.why_heading, w.why_text)}
  <ul class="sp-grid">
${w.why.map(([title, text], i) => `    <li>${icon(ICONS[i])}<b>${title}</b>${put(text, { install: me.install })}</li>`).join("\n")}
  </ul>
</div></div>

<div class="sp-sec"><div class="wrap">
  ${head(w.scale_kick, w.scale_heading, w.scale_text)}
  <div class="sp-nums">
${w.scale.map(([title, text], i) => `    <div class="sp-panel"><strong>${dec(...data.scale[i])}<small>ms</small></strong><b>${title}</b>${text}</div>`).join("\n")}
  </div>
  <p class="sp-note">${w.scale_note}</p>
</div></div>

<div class="sp-sec"><div class="wrap">
  ${head(w.weight_kick, w.weight_heading)}
  <div class="sp-cards">
    <div class="sp-panel sp-card">${cardHead("install", me.install, w.mb, mb)}<div class="sp-sq">${squares}</div></div>
    ${card("ram", me.ram, w.mb, mb)}
    ${card("cpu", dec(me.cpu, 1), "s", cpu)}
    ${card("idle", dec(me.idle, 2), "%", pct)}
  </div>
</div></div>

<div class="sp-sec"><div class="wrap">
  ${head(w.table_kick, w.table_heading, put(w.table_text, { won, of: judged.length }))}
  <div class="sp-panel sp-tbl"><table>
<thead><tr>${w.cols.map((name) => `<th scope="col">${name}</th>`).join("")}</tr></thead>
<tbody>
${rows}
</tbody>
  </table></div>
  <p class="sp-note">${w.table_note}</p>
</div></div>

<div class="sp-sec"><div class="wrap">
  <div class="sp-mh">${head(w.method_kick, w.method_heading)}
  <div class="sp-cta"><a class="btn glow" href="https://github.com/lucienPochon/regards/tree/main/bench">${w.method_read}</a><a class="btn line" href="https://github.com/lucienPochon/regards/tree/main/bench/results">${w.method_raw}</a></div></div>
  <ol class="sp-grid sp-rules">
${w.rules.map(([title, text], i) => `    <li><small aria-hidden="true">${String(i + 1).padStart(2, "0")}</small><b>${title}</b>${text}</li>`).join("\n")}
  </ol>
  <div class="sp-cards">
    <div class="sp-panel sp-run"><small>${w.run_label}</small>
<pre><i>${w.run_get}</i>
<b>&gt;</b> git clone https://github.com/lucienPochon/regards
<b>&gt;</b> cd regards

<i>${w.run_measure}</i>
<b>&gt;</b> powershell -ExecutionPolicy Bypass -File bench\\compare-apps.ps1</pre></div>
    <div class="sp-not"><h3>${w.not_heading}</h3>
    <ul>${w.not.map((text) => `<li>${text}</li>`).join("")}</ul>
    <dl>${w.machine.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join("")}</dl></div>
  </div>
  <p class="sp-note">${w.fine}</p>
</div></div>
</div>`;

  return { title: put(w.title, { drawn }), description: put(w.description, { drawn }), content };
}
