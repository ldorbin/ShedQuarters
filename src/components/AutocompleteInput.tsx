import { useEffect, useId, useRef, useState } from "react";

export interface Suggestion<T> {
  key: string;
  title: string;
  subtitle?: string;
  value: T;
}

/**
 * Text input with a suggestion dropdown. Suggestions come from past documents,
 * so repeat customers and vehicles fill themselves in without a CRM to maintain.
 */
export function AutocompleteInput<T>({
  label,
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder,
  transform,
  autoFocus,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: T) => void;
  fetchSuggestions: (query: string) => Promise<Suggestion<T>[]>;
  placeholder?: string;
  transform?: (raw: string) => string;
  autoFocus?: boolean;
  hint?: string;
}) {
  const id = useId();
  const [suggestions, setSuggestions] = useState<Suggestion<T>[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  // Set when a suggestion is chosen, so the debounce doesn't immediately
  // reopen the list against the value it just filled in.
  const skipNextFetch = useRef(false);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchSuggestions(query)
        .then((results) => {
          if (cancelled) return;
          setSuggestions(results);
          setOpen(results.length > 0);
          setHighlight(-1);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, fetchSuggestions]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const choose = (suggestion: Suggestion<T>) => {
    skipNextFetch.current = true;
    onSelect(suggestion.value);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="field autocomplete" ref={containerRef}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${id}-list`}
        onChange={(event) => onChange(transform ? transform(event.target.value) : event.target.value)}
        onFocus={() => setOpen(suggestions.length > 0)}
        onKeyDown={(event) => {
          if (!open || suggestions.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((current) => (current + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
          } else if (event.key === "Enter" && highlight >= 0) {
            event.preventDefault();
            choose(suggestions[highlight]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {hint && <span className="field-hint">{hint}</span>}

      {open && suggestions.length > 0 && (
        <ul className="autocomplete-list" id={`${id}-list`} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.key} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                className={index === highlight ? "highlighted" : undefined}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(suggestion)}
              >
                <span className="suggestion-title">{suggestion.title}</span>
                {suggestion.subtitle && (
                  <span className="suggestion-sub">{suggestion.subtitle}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
