// @vitest-environment jsdom
// A menu rendered: a switch in it flips and the menu stays; any other pick closes it.
// The keys of an input method (a composition, and the one that commits it) pick nothing.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const { Menu } = await import("./Menu");
const { snoozeAlert, timeOptionEntry } = await import("./snooze");

// jsdom has no layout, so nothing to scroll.
Element.prototype.scrollIntoView = () => {};

afterEach(cleanup);

describe("a switch in a menu", () => {
  it("flips when picked, and the menu stays open", () => {
    const onClose = vi.fn();
    const later = vi.fn();
    const alert = snoozeAlert();
    const show = vi.fn();
    const request = { anchor: { x: 0, y: 0 }, label: "Snooze until", entries: [{ label: "Later today", onSelect: later }, timeOptionEntry(alert, show)] };
    render(<Menu request={request} onClose={onClose} />);

    const toggle = screen.getByRole("menuitemcheckbox", { name: "Alert me when it comes back" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(alert.on).toBe(false);
    expect(show).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("menuitem", { name: "Later today" }));
    expect(later).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("a palette and an input method", () => {
  const palette = (pick: () => void) => ({
    anchor: { x: 0, y: 0 },
    label: "Commands",
    title: "Commands",
    filter: "Type a command",
    variant: "palette" as const,
    entries: [
      { label: "New message", onSelect: pick },
      { label: "Reply", onSelect: pick },
    ],
  });

  it("picks on a plain Enter, but not on the Enter that commits a composition", () => {
    const pick = vi.fn();
    render(<Menu request={palette(pick)} onClose={vi.fn()} />);
    const field = screen.getByRole("combobox", { name: "Type a command" });

    fireEvent.keyDown(field, { key: "Enter" });
    expect(pick).toHaveBeenCalledTimes(1);

    // Blink and Firefox mark the keydowns of a composition so, and 229 is the older mark of one.
    fireEvent.keyDown(field, { key: "Enter", isComposing: true, keyCode: 229 });
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it("keeps an input method's arrows from moving the highlight", () => {
    render(<Menu request={palette(vi.fn())} onClose={vi.fn()} />);
    const field = screen.getByRole("combobox", { name: "Type a command" });
    const highlighted = field.getAttribute("aria-activedescendant");

    fireEvent.keyDown(field, { key: "ArrowDown", isComposing: true, keyCode: 229 });
    expect(field.getAttribute("aria-activedescendant")).toBe(highlighted);
  });

  it("swallows the keydown that commits a composition on WebKit, where compositionend comes first", async () => {
    const pick = vi.fn();
    render(<Menu request={palette(pick)} onClose={vi.fn()} />);
    const field = screen.getByRole("combobox", { name: "Type a command" });

    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(pick).not.toHaveBeenCalled();

    // The flag clears in a timeout, and Enter works again after it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.keyDown(field, { key: "Enter" });
    expect(pick).toHaveBeenCalledTimes(1);
  });
});
