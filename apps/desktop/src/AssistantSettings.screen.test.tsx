// @vitest-environment jsdom
// Settings › Assistant rendered: a model on this computer is found, chosen from a list and tested.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Kept = { kind: string | null; base_url: string | null; model: string | null; has_key: boolean };
const OFF: Kept = { kind: null, base_url: null, model: null, has_key: false };
let kept: Kept = OFF;
let servers: { app: string; base_url: string; models: string[] }[] = [];
let check: { destination: string; model: string; problem: string | null; detail: string | null };
const sent: Record<string, unknown>[] = [];

const invoke = vi.fn((command: string, args?: { settings?: Record<string, unknown> }) => {
  switch (command) {
    case "assistant_settings":
      return Promise.resolve(kept);
    case "assistant_local_servers":
      return Promise.resolve(servers);
    case "set_assistant_settings": {
      const settings = args?.settings ?? {};
      sent.push(settings);
      kept = settings.kind
        ? { kind: String(settings.kind), base_url: String(settings.base_url), model: String(settings.model), has_key: false }
        : OFF;
      return Promise.resolve(kept);
    }
    case "assistant_check":
      return Promise.resolve(check);
    default:
      return Promise.resolve(null);
  }
});
vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc: (path: string) => path }));
const { AssistantPage } = await import("./AssistantSettings");

const OLLAMA = { app: "ollama", base_url: "http://localhost:11434/v1", models: ["llama3.1:8b", "qwen3:14b"] };
// A dropdown is a button that shows the choice made and opens a list.
const provider = () => screen.getByRole("combobox", { name: "Provider" }).textContent;
const pick = (name: string, choice: string) => {
  fireEvent.click(screen.getByRole("combobox", { name }));
  fireEvent.click(screen.getByRole("option", { name: choice }));
};

beforeEach(() => {
  kept = OFF;
  servers = [OLLAMA];
  check = { destination: "localhost:11434", model: "qwen3:14b", problem: null, detail: null };
  sent.length = 0;
  invoke.mockClear();
});
afterEach(cleanup);

describe("a model on this computer", () => {
  it("is looked for only once asked, then chosen from the server's list and tested", async () => {
    render(<AssistantPage />);
    await waitFor(() => expect(provider()).toBe("Off"));
    expect(invoke).not.toHaveBeenCalledWith("assistant_local_servers");

    pick("Provider", "Model on this computer");
    await screen.findByText("Ollama is running on this computer");
    expect(screen.getByText("localhost:11434")).toBeTruthy();
    expect(screen.getByText("2 models installed in Ollama.")).toBeTruthy();
    expect(screen.queryByLabelText(/API key/)).toBeNull();

    pick("Model", "qwen3:14b");
    fireEvent.click(screen.getByRole("button", { name: "Save and test" }));
    await screen.findByText("Connected: qwen3:14b answered.");
    expect(sent).toEqual([{ kind: "openai_compatible", base_url: "http://localhost:11434/v1", model: "qwen3:14b" }]);
    expect(provider()).toBe("Model on this computer");
    expect((screen.getByRole("button", { name: "Save and test" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says what was looked for when nothing answers, and lets the address be typed", async () => {
    servers = [];
    render(<AssistantPage />);
    await waitFor(() => expect(provider()).toBe("Off"));
    pick("Provider", "Model on this computer");
    await screen.findByText("No model server is answering on this computer");
    expect(screen.queryByRole("button", { name: "Save and test" })).toBeNull();

    servers = [OLLAMA];
    fireEvent.click(screen.getByRole("button", { name: "Look again" }));
    await screen.findByText("Ollama is running on this computer");

    servers = [];
    fireEvent.click(screen.getByRole("button", { name: "Look again" }));
    fireEvent.click(await screen.findByRole("button", { name: "Enter the address myself" }));
    expect(provider()).toBe("Another server");
    expect((screen.getByLabelText(/Server address/) as HTMLInputElement).value).toBe("http://localhost:11434/v1");
  });

  it("says so when it is saved but does not answer", async () => {
    kept = { kind: "openai_compatible", base_url: "http://localhost:11434/v1", model: "llama3.1:8b", has_key: false };
    check = { destination: "localhost:11434", model: "llama3.1:8b", problem: "unreachable", detail: "refused" };
    render(<AssistantPage />);
    await screen.findByText("Ollama is running on this computer");
    expect(provider()).toBe("Model on this computer");
    fireEvent.click(screen.getByRole("button", { name: "Test again" }));
    await screen.findByText(/Saved, but the test failed\. Nothing answers at localhost:11434\. Is the model server running\?/);
  });
});

describe("another server", () => {
  it("keeps a server at an address of its own under Another server", async () => {
    kept = { kind: "openai_compatible", base_url: "https://models.example.test/v1", model: "big", has_key: true };
    render(<AssistantPage />);
    await waitFor(() => expect(provider()).toBe("Another server"));
    expect((screen.getByLabelText(/Server address/) as HTMLInputElement).value).toBe("https://models.example.test/v1");
    expect(invoke).not.toHaveBeenCalledWith("assistant_local_servers");
  });
});
