// @vitest-environment jsdom
// Settings › Agents, the activity list: how long a change can still be undone, and what undo did.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = Date.UTC(2026, 10, 15, 12, 0, 0);

type Sample = { id: number; undo_id: number | null; undoable: boolean; undo_until?: number | null };
let entries: Sample[] = [];
let undone = 1;
let refuse: string | null = null;

const invoke = vi.fn((command: string) => {
  switch (command) {
    case "agent_activity":
      return Promise.resolve({
        entries: entries.map((entry) => ({
          at: START - MINUTE,
          session: "mcp-1",
          client: "mcp",
          method: "message.archive",
          args: { ids: [entry.id] },
          account_id: "a1",
          access: "triage",
          decision: "allowed",
          error_code: null,
          error: null,
          duration_ms: 4,
          before: [{ id: entry.id, mailbox_id: 1, subject: "Your parcel", seen: true }],
          ...entry,
        })),
        next: null,
      });
    case "undo_apply":
      return refuse ? Promise.reject(new Error(refuse)) : Promise.resolve({ undone });
    default:
      return Promise.resolve(null);
  }
});
vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc: (path: string) => path }));
const { AgentActivity, undoLeft } = await import("./AgentActivity");

const show = async () => {
  render(<AgentActivity accounts={[{ id: "a1", email: "sam@example.org" }]} folderName={() => "Inbox"} />);
  await screen.findAllByText("Archived");
};
/** Let time pass, and what was asked meanwhile be answered. */
const pass = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: START });
  entries = [];
  undone = 1;
  refuse = null;
  invoke.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the time left to undo", () => {
  it("is never rounded up", () => {
    expect(undoLeft(START + 24 * HOUR, START)).toBe("24 h left");
    expect(undoLeft(START + 24 * HOUR - 1, START)).toBe("23 h left");
    expect(undoLeft(START + HOUR, START)).toBe("1 h left");
    expect(undoLeft(START + HOUR - 1, START)).toBe("59 min left");
    expect(undoLeft(START + MINUTE, START)).toBe("1 min left");
    expect(undoLeft(START + MINUTE - 1, START)).toBe("Under a minute left");
  });

  it("is on the row beside Undo, and counts down", async () => {
    entries = [{ id: 1, undo_id: 9001, undoable: true, undo_until: START + 7 * MINUTE + 30_000 }];
    await show();
    expect(screen.getByText("7 min left")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();

    await pass(MINUTE);
    expect(screen.getByText("6 min left")).toBeTruthy();
    await pass(6 * MINUTE);
    expect(screen.getByText("Under a minute left").className).toContain("soon");
  });

  it("ends on the row at its time, not at the next answer from the daemon", async () => {
    // The daemon still says it can be undone: the list it gave is a few seconds old.
    entries = [{ id: 1, undo_id: 9001, undoable: true, undo_until: START + 20_000 }];
    await show();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();

    await pass(30_000);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByText("Can no longer be undone")).toBeTruthy();
  });

  it("says so on a change whose undo is over, and nothing on what changed nothing", async () => {
    entries = [
      { id: 1, undo_id: 9001, undoable: false, undo_until: null },
      { id: 2, undo_id: null, undoable: false },
    ];
    await show();
    expect(screen.getAllByText("Can no longer be undone")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("is left out when the daemon does not say until when", async () => {
    entries = [{ id: 1, undo_id: 9001, undoable: true }];
    await show();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.queryByText(/left$/)).toBeNull();
  });
});

describe("undoing from the row", () => {
  beforeEach(() => {
    entries = [{ id: 1, undo_id: 9001, undoable: true, undo_until: START + 23 * HOUR }];
  });

  it("says Undone once something was set back", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByText("Undone");
    expect(invoke).toHaveBeenCalledWith("undo_apply", { id: 9001 });
    expect(screen.queryByText("23 h left")).toBeNull();
  });

  it("says that nothing was set back, instead of Undone", async () => {
    undone = 0;
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByText("Nothing to undo");
    expect(screen.queryByText("Undone")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("deleted for good");
  });

  it("shows why when the daemon refuses, and keeps the button", async () => {
    refuse = "this can no longer be undone";
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("this can no longer be undone"));
    expect(screen.queryByText("Undone")).toBeNull();
  });
});
