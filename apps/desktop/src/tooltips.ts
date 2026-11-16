// The app's own tooltips. The code keeps saying what a control is with `title`;
// this shows it: the name and, when the title ends with a key in brackets
// ("Close (Esc)"), that key in a cap. It comes after a short rest of the
// pointer, at once when the keys reach a control, and at once when another
// tooltip was showing a moment ago. The system's tooltip never shows: the
// title moves to `data-tip` the first time the pointer or the keys arrive.

const REST_MS = 400;
/** After a tooltip hides, the next one comes at once for this long. */
const WARM_MS = 500;
const GAP = 6;
const MARGIN = 8;

/** "Close (Esc)" → the name and its key; a title with no key in brackets is all name. */
export function tipParts(text: string): { label: string; keys: string[] } {
  const found = /^(.*\S) \(([^\s()]{1,16})\)$/s.exec(text);
  if (!found) return { label: text, keys: [] };
  const key = found[2];
  // "Ctrl+Shift+K" is three caps; a "+" key stays a key ("Ctrl++").
  const keys = key === "+" ? ["+"] : key.endsWith("++") ? [...key.slice(0, -2).split("+"), "+"] : key.split("+");
  return { label: found[1], keys };
}

/**
 * Move a control's `title` to `data-tip`, so only our tooltip shows. A control
 * named by its title alone (no text, no label) keeps that name as aria-label.
 */
export function takeTitle(element: HTMLElement): string | null {
  const title = element.getAttribute("title");
  if (title !== null) {
    element.removeAttribute("title");
    if (title.trim() === "") delete element.dataset.tip;
    else {
      element.dataset.tip = title;
      const named = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby") || (element.textContent ?? "").trim() !== "";
      if (!named) element.setAttribute("aria-label", title);
    }
  }
  return element.dataset.tip ?? null;
}

let installed = false;

/** Start showing tooltips in this window. Once is enough; a second call does nothing. */
export function installTooltips(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;

  let tip: HTMLDivElement | null = null;
  let owner: HTMLElement | null = null;
  let timer = 0;
  let hiddenAt = 0;
  // A title React writes again while the pointer is still there (a name that changes on a click).
  const watcher = new MutationObserver(() => {
    if (owner && owner.hasAttribute("title")) {
      const text = takeTitle(owner);
      if (tip && text) fill(tip, text, owner);
      else hide();
    }
  });

  const fill = (box: HTMLDivElement, text: string, by: HTMLElement) => {
    const { label, keys } = tipParts(text);
    box.replaceChildren();
    const name = document.createElement("span");
    name.textContent = label;
    box.append(name);
    if (keys.length > 0) {
      const caps = document.createElement("span");
      caps.className = "tooltip-keys";
      for (const key of keys) {
        const cap = document.createElement("kbd");
        cap.textContent = key;
        caps.append(cap);
      }
      box.append(caps);
    }
    // Under the control, in the middle; above when there is no room below; never off the window.
    const at = by.getBoundingClientRect();
    const size = box.getBoundingClientRect();
    let top = at.bottom + GAP;
    if (top + size.height > window.innerHeight - MARGIN) top = at.top - size.height - GAP;
    const left = at.left + at.width / 2 - size.width / 2;
    box.style.left = `${Math.round(Math.max(MARGIN, Math.min(left, window.innerWidth - size.width - MARGIN)))}px`;
    box.style.top = `${Math.round(Math.max(MARGIN, top))}px`;
  };

  const hide = () => {
    window.clearTimeout(timer);
    watcher.disconnect();
    if (tip) {
      tip.remove();
      tip = null;
      hiddenAt = Date.now();
    }
    owner = null;
  };

  const show = (element: HTMLElement, text: string) => {
    if (!element.isConnected) return;
    tip = document.createElement("div");
    tip.className = "tooltip";
    // The control already has its name; this is the same words for the eye.
    tip.setAttribute("aria-hidden", "true");
    document.body.append(tip);
    fill(tip, text, element);
  };

  const arrive = (element: HTMLElement, now: boolean) => {
    if (element === owner) return;
    hide();
    const text = takeTitle(element);
    if (!text) return;
    owner = element;
    watcher.observe(element, { attributes: true, attributeFilter: ["title"] });
    if (now || Date.now() - hiddenAt < WARM_MS) show(element, text);
    else timer = window.setTimeout(() => show(element, text), REST_MS);
  };

  const holder = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>("[title], [data-tip]") : null;

  document.addEventListener("mouseover", (event) => {
    if (event.buttons !== 0) return;
    const element = holder(event.target);
    if (element) arrive(element, false);
    else hide();
  });
  document.addEventListener("mouseleave", hide);
  document.addEventListener("focusin", (event) => {
    const element = holder(event.target);
    // Only when the keys brought focus there: a click has the pointer's own tooltip.
    if (element && element === event.target && element.matches(":focus-visible")) arrive(element, true);
  });
  document.addEventListener("focusout", (event) => {
    if (owner && event.target === owner) hide();
  });
  document.addEventListener("mousedown", hide, true);
  document.addEventListener("keydown", hide, true);
  document.addEventListener("scroll", hide, true);
  document.addEventListener("wheel", hide, { capture: true, passive: true });
  window.addEventListener("blur", hide);
}
