import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icons";
import { Menu, type MenuRequest, anchorOf } from "./Menu";
import { radioKeys, radioTab } from "./radios";
import { t } from "./i18n";

/** A setting: what it is on the left, the control on the right. */
export function Option({
  icon,
  label,
  description,
  children,
}: {
  icon: IconName;
  label: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="option">
      <span className="option-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="option-text">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </span>
      <span className="option-control">{children}</span>
    </div>
  );
}

/** A few choices side by side. */
export function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <span className="choice" role="radiogroup" aria-label={label} onKeyDown={(event) => radioKeys(event)}>
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          tabIndex={radioTab(value === option.id, index, options.some((one) => one.id === value))}
          className={value === option.id ? "chosen" : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

/** On or off. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)}>
      <span className={on ? "toggle on" : "toggle"} aria-hidden="true" />
    </button>
  );
}

/** A list this long gets a field to find an entry by typing. */
const FILTER_FROM = 9;

/**
 * One of several choices, in a dropdown: a button that opens the app's own menu, with a check on the choice made.
 * `className` gives the button its look where it is not a Settings row (a toolbar, a card, a form).
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className = "settings-select",
  disabled,
  title,
}: {
  value: T;
  /** `font`: a typeface to show the entry in (the composer's fonts). */
  options: { id: T; label: string; font?: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = () => {
    const element = button.current;
    if (!element) return;
    setMenu({
      anchor: anchorOf(element),
      label,
      minWidth: element.offsetWidth,
      filter: options.length >= FILTER_FROM ? t("Find in the list") : undefined,
      entries: options.map((option) => ({
        label: option.label,
        font: option.font,
        selected: option.id === value,
        onSelect: () => onChange(option.id),
      })),
    });
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`${className} select-button`}
        title={title}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={menu !== null}
        aria-label={label}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            open();
          }
        }}
      >
        <span className="select-value">{options.find((option) => option.id === value)?.label}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {/* Outside whatever holds the button: a label around it would take a click beside the list as a click on the button. */}
      {menu &&
        createPortal(
          <Menu
            request={menu}
            onClose={() => {
              setMenu(null);
              button.current?.focus();
            }}
          />,
          document.body,
        )}
    </>
  );
}

/** A row that opens a page of its own. */
export function LinkRow({ icon, label, detail, onOpen }: { icon: IconName; label: string; detail?: string; onOpen: () => void }) {
  return (
    <button type="button" className="option link-row" onClick={onOpen}>
      <span className="option-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="option-text">
        <strong>{label}</strong>
        {detail && <span>{detail}</span>}
      </span>
      <Icon name="chevronRight" size={16} />
    </button>
  );
}

/** The title of a page opened from another, with the way back. */
export function SubPageHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="subpage-head">
      <button type="button" className="icon-btn" aria-label={t("Back")} title={t("Back")} onClick={onBack}>
        <Icon name="back" size={17} />
      </button>
      <h3>{title}</h3>
    </div>
  );
}
