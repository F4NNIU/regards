// @vitest-environment jsdom
// The dropdown: a button that shows the choice made and opens the app's menu as a list.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const { Select } = await import("./SettingsControls");

// jsdom has no layout, so nothing to scroll.
Element.prototype.scrollIntoView = () => {};
afterEach(cleanup);

const SECONDS = [5, 10, 15, 30].map((seconds) => ({ id: seconds, label: `${seconds} seconds` }));

describe("a dropdown", () => {
  it("shows the choice made, and opens a list with that entry marked and focused", () => {
    render(<Select label="Undo send" value={10} options={SECONDS} onChange={() => {}} />);
    const button = screen.getByRole("combobox", { name: "Undo send" });
    expect(button.textContent).toBe("10 seconds");
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox", { name: "Undo send" })).toBeTruthy();
    const chosen = screen.getByRole("option", { name: "10 seconds" });
    expect(chosen.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "5 seconds" }).getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(chosen);
  });

  it("gives the entry picked, closes, and puts focus back on the button", () => {
    const onChange = vi.fn();
    render(<Select label="Undo send" value={10} options={SECONDS} onChange={onChange} />);
    const button = screen.getByRole("combobox", { name: "Undo send" });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("option", { name: "30 seconds" }));
    expect(onChange).toHaveBeenCalledWith(30);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("opens with the arrow keys; in the list a letter, Home and End move, and Escape closes without a pick", () => {
    const onChange = vi.fn();
    const options = ["Like this computer", "English", "Français"].map((label) => ({ id: label, label }));
    render(<Select label="Language" value="English" options={options} onChange={onChange} />);
    const button = screen.getByRole("combobox", { name: "Language" });
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "f" });
    expect(document.activeElement).toBe(screen.getByRole("option", { name: "Français" }));
    fireEvent.keyDown(list, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("option", { name: "Like this computer" }));
    fireEvent.keyDown(list, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("option", { name: "Français" }));
    fireEvent.keyDown(list, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it("has a field to find an entry when the list is long, starting on the choice made", () => {
    const onChange = vi.fn();
    const options = Array.from({ length: 12 }, (_, index) => ({ id: index, label: `Signature ${index + 1}` }));
    render(<Select label="Signature" value={4} options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Signature" }));
    const field = screen.getByPlaceholderText("Find in the list");
    expect(document.activeElement).toBe(field);
    expect(screen.getByRole("option", { name: "Signature 5" }).className).toContain("highlighted");
    fireEvent.change(field, { target: { value: "12" } });
    expect(screen.getAllByRole("option").length).toBe(1);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(11);
  });
});
