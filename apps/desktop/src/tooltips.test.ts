// @vitest-environment jsdom
// The app's own tooltips: a title's name and key, and the title moved out of the system's reach.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installTooltips, takeTitle, tipParts } from "./tooltips";

const button = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
};
const tip = () => document.querySelector(".tooltip");
const over = (element: Element) => element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

beforeAll(() => installTooltips());
afterEach(() => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  vi.useRealTimers();
});

describe("a title's parts", () => {
  it("takes the key in brackets at the end as caps", () => {
    expect(tipParts("Close (Esc)")).toEqual({ label: "Close", keys: ["Esc"] });
    expect(tipParts("Send (Ctrl+Enter)")).toEqual({ label: "Send", keys: ["Ctrl", "Enter"] });
    expect(tipParts("Zoom in (Ctrl++)")).toEqual({ label: "Zoom in", keys: ["Ctrl", "+"] });
  });

  it("leaves a title with no key, or with words in brackets, whole", () => {
    expect(tipParts("Signature")).toEqual({ label: "Signature", keys: [] });
    expect(tipParts("The window (web packages)")).toEqual({ label: "The window (web packages)", keys: [] });
  });
});

describe("a control's title", () => {
  it("moves to data-tip, and names a control that had no other name", () => {
    const icon = button(`<button title="Archive (E)"><svg></svg></button>`);
    expect(takeTitle(icon)).toBe("Archive (E)");
    expect(icon.hasAttribute("title")).toBe(false);
    expect(icon.getAttribute("aria-label")).toBe("Archive (E)");
  });

  it("leaves a name that is already there", () => {
    const labelled = button(`<button title="Archive (E)" aria-label="Archive"><svg></svg></button>`);
    takeTitle(labelled);
    expect(labelled.getAttribute("aria-label")).toBe("Archive");
    const worded = button(`<span title="sam@example.org">Sam Rivera</span>`);
    takeTitle(worded);
    expect(worded.hasAttribute("aria-label")).toBe(false);
  });
});

describe("the tooltip", () => {
  it("comes after the pointer rests, with the name and the key, and goes on a key press", () => {
    vi.useFakeTimers({ now: 10_000_000 });
    const archive = button(`<button title="Archive (E)" aria-label="Archive"><svg></svg></button>`);
    over(archive.firstElementChild as Element);
    expect(tip()).toBeNull();
    vi.advanceTimersByTime(450);
    expect(tip()?.querySelector("span")?.textContent).toBe("Archive");
    expect(tip()?.querySelector("kbd")?.textContent).toBe("E");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
    expect(tip()).toBeNull();
  });

  it("comes at once when another was showing a moment ago", () => {
    vi.useFakeTimers({ now: 20_000_000 });
    document.body.innerHTML = `<button id="a" title="Archive">a</button><button id="b" title="Delete">b</button>`;
    const [a, b] = [document.getElementById("a") as HTMLElement, document.getElementById("b") as HTMLElement];
    over(a);
    vi.advanceTimersByTime(450);
    expect(tip()?.textContent).toBe("Archive");
    over(b);
    expect(tip()?.textContent).toBe("Delete");
  });

  it("does not come for a control with nothing to say", () => {
    vi.useFakeTimers({ now: 30_000_000 });
    const plain = button(`<button>Save</button>`);
    over(plain);
    vi.advanceTimersByTime(1000);
    expect(tip()).toBeNull();
  });
});
