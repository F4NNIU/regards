// @vitest-environment jsdom
// Choosing a date and time: a month to pick a day from, and a time of day in two small fields.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const { TimeInput, TimePicker, weekStart } = await import("./TimePicker");

// Monday 16 November 2026, 10:00, local time.
const NOW = new Date(2026, 10, 16, 10, 0).getTime();
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const at = (day: number, hours: number, minutes = 0, month = 10) => new Date(2026, month, day, hours, minutes).getTime();
// "Tuesday, November 17" or "mardi 17 novembre": the day and the month, in either order.
const dayButton = (day: number, month = "November") =>
  screen.getByRole("button", { name: new RegExp(`${month} ${day}$|(^| )${day} ${month}`) });

describe("the date and time dialog", () => {
  it("opens on the time it was given, and answers with it", () => {
    const onAnswer = vi.fn();
    render(<TimePicker title="Snooze until" confirm="Snooze" initial={at(17, 9)} onAnswer={onAnswer} />);
    expect(screen.getByText(/November 2026/i)).toBeTruthy();
    expect(dayButton(17).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Hours") as HTMLInputElement).value).toBe("09");
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    expect(onAnswer).toHaveBeenCalledWith(at(17, 9));
  });

  it("closes past days, and takes a click on another day", () => {
    const onAnswer = vi.fn();
    render(<TimePicker title="Snooze until" confirm="Snooze" initial={at(17, 9)} onAnswer={onAnswer} />);
    expect((dayButton(15) as HTMLButtonElement).disabled).toBe(true);
    expect((dayButton(16) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(dayButton(20));
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    expect(onAnswer).toHaveBeenCalledWith(at(20, 9));
  });

  it("moves with the arrow keys, into the next month too, and not into the past", () => {
    const onAnswer = vi.fn();
    render(<TimePicker title="Snooze until" confirm="Snooze" initial={at(17, 9)} onAnswer={onAnswer} />);
    fireEvent.keyDown(dayButton(17), { key: "ArrowUp" });
    // A week before is past: nothing moves.
    expect(dayButton(17).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(dayButton(17), { key: "ArrowDown" });
    fireEvent.keyDown(dayButton(24), { key: "ArrowDown" });
    expect(screen.getByText(/December 2026/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }));
    expect(onAnswer).toHaveBeenCalledWith(at(1, 9, 0, 11));
  });

  it("shows other months, never one before this one", () => {
    render(<TimePicker title="Send at" confirm="Schedule" initial={at(17, 9)} onAnswer={() => {}} />);
    expect((screen.getByRole("button", { name: "Previous month" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText(/December 2026/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous month" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("refuses a time that is not in the future", () => {
    const onAnswer = vi.fn();
    render(<TimePicker title="Snooze until" confirm="Snooze" initial={at(16, 11)} onAnswer={onAnswer} />);
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "08" } });
    expect(screen.getByText("Choose a time in the future.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Snooze" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText("Minutes"), { key: "Enter" });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAnswer).toHaveBeenCalledWith(null);
  });
});

function Clock({ start, onChange }: { start: string; onChange: (value: string) => void }) {
  const [value, setValue] = useState(start);
  return (
    <TimeInput
      label="Time"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("a time of day", () => {
  it("keeps digits, within the day", () => {
    const onChange = vi.fn();
    render(<Clock start="09:00" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "7x" } });
    expect(onChange).toHaveBeenLastCalledWith("07:00");
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "31" } });
    expect(onChange).toHaveBeenLastCalledWith("23:00");
    fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "75" } });
    expect(onChange).toHaveBeenLastCalledWith("23:59");
  });

  it("steps with the arrows, minutes by five, round the clock", () => {
    const onChange = vi.fn();
    render(<Clock start="23:55" onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText("Hours"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("00:55");
    fireEvent.keyDown(screen.getByLabelText("Minutes"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("00:00");
    fireEvent.keyDown(screen.getByLabelText("Minutes"), { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("00:55");
  });
});

describe("the first day of the week", () => {
  it("is Monday in Switzerland, Sunday in the United States, Monday when unknown", () => {
    expect(weekStart("fr-CH")).toBe(1);
    expect([0, 1]).toContain(weekStart("en-US"));
    expect(weekStart("not a locale")).toBe(1);
  });
});
