// @vitest-environment jsdom
// Fields shared by the forms: a port, a password or key with its eye, and what is wrong with an address.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const { PortInput, SecretInput, emailProblem, portOk } = await import("./Fields");

afterEach(cleanup);

function Port({ start }: { start: number }) {
  const [port, setPort] = useState(start);
  return (
    <label>
      Port
      <PortInput value={port} onChange={setPort} />
    </label>
  );
}

describe("a port field", () => {
  it("keeps digits only, five at most", () => {
    render(<Port start={993} />);
    const field = screen.getByLabelText("Port") as HTMLInputElement;
    expect(field.getAttribute("type")).toBeNull();
    fireEvent.change(field, { target: { value: "4a6-5" } });
    expect(field.value).toBe("465");
    fireEvent.change(field, { target: { value: "1234567" } });
    expect(field.value).toBe("12345");
  });

  it("says so itself when the number cannot be a port", () => {
    render(<Port start={993} />);
    const field = screen.getByLabelText(/Port/) as HTMLInputElement;
    expect(field.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(field, { target: { value: "70000" } });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("1 to 65535");
    fireEvent.change(field, { target: { value: "" } });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(field, { target: { value: "587" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("knows which numbers are ports", () => {
    expect([0, 1, 993, 65535, 65536, 1.5].map(portOk)).toEqual([false, true, true, true, false, false]);
  });
});

describe("a password or key field", () => {
  it("hides what is typed until the eye is pressed", () => {
    const onChange = vi.fn();
    render(<SecretInput aria-label="Password" value="secret" onChange={onChange} />);
    const field = screen.getByLabelText("Password") as HTMLInputElement;
    expect(field.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show the password" }));
    expect(field.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide the password" }));
    expect(field.type).toBe("password");
    fireEvent.change(field, { target: { value: "other" } });
    expect(onChange).toHaveBeenCalledWith("other");
  });

  it("names the eye for a key", () => {
    render(<SecretInput what="key" aria-label="API key" value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Show the key" })).toBeTruthy();
  });
});

describe("an address as typed", () => {
  it("is fine when empty or complete", () => {
    expect(emailProblem("")).toBeNull();
    expect(emailProblem(" ada@example.org ")).toBeNull();
    expect(emailProblem("ada@mail.example.co.uk")).toBeNull();
  });

  it("says what is missing", () => {
    expect(emailProblem("ada")).toBe("An address looks like name@example.org.");
    expect(emailProblem("@example.org")).toBe("An address looks like name@example.org.");
    expect(emailProblem("ada@b@example.org")).toBe("An address looks like name@example.org.");
    expect(emailProblem("ada@example")).toBe("The part after @ needs an ending, such as .com or .ch.");
    expect(emailProblem("ada@example.")).toBe("The part after @ needs an ending, such as .com or .ch.");
  });
});
