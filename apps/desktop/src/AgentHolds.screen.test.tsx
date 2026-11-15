// @vitest-environment jsdom
// Settings › Agents, a send that waits: the warning when the same message was already asked.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hold } from "./agents";

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

let holds: Hold[] = [];
const invoke = vi.fn((command: string) => Promise.resolve(command === "hold_list" ? { holds } : null));
vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc: (path: string) => path }));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));
const { AgentHolds, repeatWarning } = await import("./AgentHolds");

const send = (repeats?: Hold["repeats"]): Hold => ({
  id: 7,
  created_at: Date.now() - MINUTE,
  expires_at: Date.now() + 23 * 60 * MINUTE,
  session: "mcp-1",
  client: "mcp",
  account_id: "a1",
  method: "draft.send",
  params: { id: 3 },
  description: "Send “Plans” to Bob",
  reason: "sending",
  draft_id: null,
  status: "pending",
  decided_at: null,
  result: null,
  error: null,
  ...(repeats === undefined ? {} : { repeats }),
});

beforeEach(() => {
  holds = [];
});
afterEach(cleanup);

describe("the same message asked before", () => {
  it("is worded by what became of the earlier request", () => {
    const asked = (status: NonNullable<Hold["repeats"]>["status"], minutes = 5) =>
      repeatWarning({ asked_at: NOW - minutes * MINUTE, hold_id: status === null ? null : 4, status }, NOW);
    expect(asked("approved")).toBe(
      "The same message was already asked 5 min ago, and you approved it. Sending this one sends it a second time.",
    );
    expect(asked(null)).toBe(
      "The same message already went 5 min ago, without waiting for you. Sending this one sends it a second time.",
    );
    expect(asked("pending", 0)).toBe(
      "The same message was already asked just now and is still waiting for you. Sending both sends it twice.",
    );
    expect(asked("rejected", 59)).toBe("The same message was already asked 59 min ago, and you rejected it.");
    expect(asked("expired", 23 * 60 + 59)).toBe(
      "The same message was already asked 23 h ago, and that request expired undecided.",
    );
    expect(asked("failed", 60)).toBe(
      "The same message was already asked 1 h ago and approved, but it could not be sent.",
    );
  });

  it("says nothing when the send repeats nothing", () => {
    expect(repeatWarning(undefined, NOW)).toBeNull();
    expect(repeatWarning(null, NOW)).toBeNull();
  });

  it("is on the card that waits, above the buttons", async () => {
    holds = [send({ asked_at: Date.now() - 5 * MINUTE, hold_id: 4, status: "approved" })];
    render(<AgentHolds accounts={[{ id: "a1", email: "sam@example.org" }]} />);
    await screen.findByText("Send “Plans” to Bob");
    expect(screen.getByRole("alert").textContent).toContain("was already asked 5 min ago, and you approved it");
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("is not on a send asked for the first time", async () => {
    holds = [send()];
    render(<AgentHolds accounts={[{ id: "a1", email: "sam@example.org" }]} />);
    await screen.findByText("Send “Plans” to Bob");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
