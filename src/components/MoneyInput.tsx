import { useEffect, useState } from "react";
import { decimalStringToPence, penceToDecimalString } from "../../shared/format";

/**
 * Edits a pence value as pounds. Keeps its own draft string while focused so
 * typing "12.5" doesn't get reformatted to "12.50" mid-keystroke.
 */
export function MoneyInput({
  valuePence,
  onChange,
  id,
  placeholder = "0.00",
  className,
  ariaLabel,
}: {
  valuePence: number;
  onChange: (pence: number) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(() => penceToDecimalString(valuePence));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(penceToDecimalString(valuePence));
  }, [valuePence, focused]);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className={className}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      onFocus={(event) => {
        setFocused(true);
        event.target.select();
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(decimalStringToPence(event.target.value));
      }}
      onBlur={() => {
        setFocused(false);
        setDraft(penceToDecimalString(decimalStringToPence(draft)));
      }}
    />
  );
}
