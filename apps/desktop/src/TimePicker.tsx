import { type KeyboardEvent, useId, useRef, useState } from "react";
import { composing, compositionEnd, useShortcuts } from "./shortcuts";
import { useDialogFocus } from "./dialogFocus";
import { Icon } from "./icons";
import { appLocale, t } from "./i18n";

const pad = (n: number) => String(n).padStart(2, "0");
const dayStart = (time: number | Date) => {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date;
};
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The day a week starts on where the app's dates come from: 0 Sunday … 6 Saturday; Monday when unknown. */
export function weekStart(locale: string): number {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & { weekInfo?: { firstDay?: number }; getWeekInfo?: () => { firstDay?: number } };
    const first = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay;
    // 1 Monday … 7 Sunday there.
    if (typeof first === "number" && first >= 1 && first <= 7) return first % 7;
  } catch {
    // An unknown locale: Monday.
  }
  return 1;
}

/**
 * A time of day, as two small fields in one box: digits only; the arrows step
 * (minutes by five); two digits of hours move on to the minutes.
 * `value` is "HH:MM".
 */
export function TimeInput({
  value,
  onChange,
  label,
  disabled,
  className,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  onEnter?: () => void;
}) {
  const [hours, minutes] = value.split(":").map((part) => Number(part) || 0);
  // What is being typed in a part, until the field is left: "7" is not yet "07".
  const [typing, setTyping] = useState<{ part: "h" | "m"; text: string } | null>(null);
  const minutesField = useRef<HTMLInputElement>(null);
  const give = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);
  const field = (part: "h" | "m") => {
    const max = part === "h" ? 23 : 59;
    const now = part === "h" ? hours : minutes;
    const set = (next: number) => (part === "h" ? give(next, minutes) : give(hours, next));
    return {
      inputMode: "numeric" as const,
      maxLength: 2,
      disabled,
      "aria-label": part === "h" ? t("Hours") : t("Minutes"),
      value: typing?.part === part ? typing.text : pad(now),
      onFocus: (event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select(),
      onBlur: () => setTyping(null),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const text = event.target.value.replace(/\D/g, "").slice(0, 2);
        setTyping({ part, text });
        if (text !== "") set(Math.min(max, Number(text)));
        if (part === "h" && text.length === 2) {
          setTyping(null);
          minutesField.current?.focus();
        }
      },
      onCompositionEnd: compositionEnd,
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (composing(event.nativeEvent)) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const step = (part === "h" ? 1 : 5) * (event.key === "ArrowUp" ? 1 : -1);
          setTyping(null);
          set((now + step + max + 1) % (max + 1));
        } else if (event.key === "Enter" && onEnter) {
          event.preventDefault();
          onEnter();
        }
      },
    };
  };
  return (
    <span className={className ? `time-input ${className}` : "time-input"} role="group" aria-label={label} aria-disabled={disabled || undefined}>
      <input {...field("h")} />
      <span aria-hidden="true">:</span>
      <input ref={minutesField} {...field("m")} />
    </span>
  );
}

/** Choose a date and time (local), for a snooze or a later send. Resolves with Unix ms, or null. */
export function TimePicker({
  title,
  confirm,
  initial,
  onAnswer,
}: {
  title: string;
  confirm: string;
  initial: number;
  onAnswer: (time: number | null) => void;
}) {
  const today = dayStart(Date.now());
  const [day, setDay] = useState(() => {
    const first = dayStart(initial);
    return first < today ? today : first;
  });
  const [view, setView] = useState(() => new Date(day.getFullYear(), day.getMonth(), 1));
  const [clock, setClock] = useState(() => `${pad(new Date(initial).getHours())}:${pad(new Date(initial).getMinutes())}`);
  useShortcuts({ Escape: () => onAnswer(null) }, { modal: true });
  const box = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  useDialogFocus(box);
  const titleId = useId();

  const [hours, minutes] = clock.split(":").map(Number);
  const time = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes).getTime();
  const valid = time > Date.now();
  const answer = () => {
    if (valid) onAnswer(time);
  };

  const locale = appLocale();
  const first = weekStart(locale);
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(view);
  const dayName = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const short = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 2024-01-07 was a Sunday: the week's days from the first one.
  const weekdays = Array.from({ length: 7 }, (_, index) => short.format(new Date(2024, 0, 7 + ((first + index) % 7))));
  const blanks = (view.getDay() - first + 7) % 7;
  const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const firstMonth = view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();
  const dayShown = view.getFullYear() === day.getFullYear() && view.getMonth() === day.getMonth();

  const go = (to: Date, focus: boolean) => {
    if (to < today) return;
    setDay(to);
    setView(new Date(to.getFullYear(), to.getMonth(), 1));
    if (focus) window.requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.focus());
  };
  const keys = (event: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      go(new Date(day.getFullYear(), day.getMonth(), day.getDate() + step), true);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const month = day.getMonth() + (event.key === "PageDown" ? 1 : -1);
      const last = new Date(day.getFullYear(), month + 1, 0).getDate();
      go(new Date(day.getFullYear(), month, Math.min(day.getDate(), last)), true);
    }
  };

  return (
    <div className="backdrop" onMouseDown={() => onAnswer(null)}>
      <section
        ref={box}
        tabIndex={-1}
        className="dialog confirm-dialog time-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <div className="calendar-head">
          <strong aria-live="polite">{monthName}</strong>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("Previous month")}
            title={t("Previous month")}
            disabled={firstMonth}
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          >
            <Icon name="back" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("Next month")}
            title={t("Next month")}
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        <div ref={grid} className="calendar" onKeyDown={keys}>
          {weekdays.map((name) => (
            <span key={name} className="calendar-weekday" aria-hidden="true">
              {name}
            </span>
          ))}
          {Array.from({ length: blanks }, (_, index) => (
            <span key={`blank-${index}`} />
          ))}
          {Array.from({ length: count }, (_, index) => {
            const date = new Date(view.getFullYear(), view.getMonth(), index + 1);
            const picked = sameDay(date, day);
            return (
              <button
                key={index}
                type="button"
                className={["calendar-day", sameDay(date, today) ? "today" : "", picked ? "picked" : ""].join(" ")}
                aria-label={dayName.format(date)}
                aria-pressed={picked}
                // The arrows move from day to day; Tab lands on the day chosen, or in another month on the first that can be.
                tabIndex={(dayShown ? picked : firstMonth ? sameDay(date, today) : index === 0) ? 0 : -1}
                disabled={date < today}
                autoFocus={picked}
                onClick={() => go(date, false)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <div className="calendar-time">
          <span>{t("Time")}</span>
          <TimeInput label={t("Time")} value={clock} onChange={setClock} onEnter={answer} />
        </div>
        <p className={valid ? "calendar-chosen" : "calendar-chosen error"} aria-live="polite">
          {valid ? `${dayName.format(day)}, ${clock}` : t("Choose a time in the future.")}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => onAnswer(null)}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn primary" disabled={!valid} onClick={answer}>
            {confirm}
          </button>
        </div>
      </section>
    </div>
  );
}
