import { type InputHTMLAttributes, useId, useState } from "react";
import { Icon } from "./icons";
import { t } from "./i18n";

/** A password or a key: hidden as typed, with an eye to show it. */
export function SecretInput({
  value,
  onChange,
  what = "password",
  className = "input",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  /** What the eye's name says it shows. */
  what?: "password" | "key";
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [shown, setShown] = useState(false);
  const name =
    what === "key" ? (shown ? t("Hide the key") : t("Show the key")) : shown ? t("Hide the password") : t("Show the password");
  return (
    <span className="secret-field">
      <input {...rest} className={className} type={shown ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" className="icon-btn" aria-label={name} title={name} aria-pressed={shown} onClick={() => setShown(!shown)}>
        <Icon name={shown ? "eyeOff" : "eye"} size={17} />
      </button>
    </span>
  );
}

/** A port can be 1 to 65535. */
export const portOk = (port: number) => Number.isInteger(port) && port >= 1 && port <= 65535;

/**
 * A server's port: digits only, with no arrows and no change from the mouse
 * wheel. Out of range, the field says so itself. Empty counts as 0.
 */
export function PortInput({ value, onChange }: { value: number; onChange: (port: number) => void }) {
  const id = useId();
  const bad = !portOk(value);
  return (
    <>
      <input
        className="input"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        value={value === 0 ? "" : String(value)}
        aria-invalid={bad}
        aria-describedby={bad ? id : undefined}
        onChange={(event) => onChange(Number(event.target.value.replace(/\D/g, "").slice(0, 5)) || 0)}
      />
      {bad && (
        <span id={id} className="field-error" role="alert">
          {t("1 to 65535")}
        </span>
      )}
    </>
  );
}

/** What is wrong with an address as typed, or null: one @, and a domain with an ending. */
export function emailProblem(value: string): string | null {
  const address = value.trim();
  if (address === "") return null;
  const at = address.indexOf("@");
  if (at < 1 || /\s/.test(address) || address.indexOf("@", at + 1) !== -1) return t("An address looks like name@example.org.");
  if (!/^[^.]+(\.[^.]+)+$/.test(address.slice(at + 1))) return t("The part after @ needs an ending, such as .com or .ch.");
  return null;
}
