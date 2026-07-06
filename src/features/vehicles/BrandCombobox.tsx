import { useEffect, useRef, useState } from "react";
import { Car, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { BRAND_LOGOS, filterBrands } from "./carBrands";

/**
 * Searchable car-brand picker. Type the first letters in Arabic OR English
 * to filter; free text is allowed for brands not in the list.
 * Renders a real <input> so it also works inside FormData-based forms.
 */
export function BrandCombobox({
  value,
  defaultValue,
  onChange,
  name,
  placeholder = "اكتب أو اختر الماركة…",
  autoFocus,
  required,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (brand: string) => void;
  name?: string;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const [text, setText] = useState(value ?? defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Controlled usage: follow the value prop when the parent changes it.
  useEffect(() => {
    if (value !== undefined) setText(value);
  }, [value]);

  const options = filterBrands(text);

  function commit(brand: string) {
    setText(brand);
    onChange?.(brand);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (options[highlight]) {
        e.preventDefault();
        commit(options[highlight].ar);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Keep the highlighted row visible while arrowing through the list.
  useEffect(() => {
    listRef.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className="relative">
        <input
          name={name}
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required={required}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            onChange?.(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full h-11 ps-3 pe-9 text-base rounded-lg border border-slate-300 bg-white",
            "placeholder:text-slate-400 focus-ring"
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((o) => !o)}
          className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400"
          title="عرض الماركات"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {open && options.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1"
        >
          {options.map((b, i) => {
            const logoUrl = b.logo ? BRAND_LOGOS[b.logo] : undefined;
            return (
              <li key={b.en}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(b.ar)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-base text-start",
                    i === highlight ? "bg-brand-50 text-brand-800" : "text-slate-700"
                  )}
                >
                  <span className="w-9 h-9 grid place-items-center shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt={b.en} className="max-w-full max-h-full object-contain" loading="lazy" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-slate-100 grid place-items-center">
                        <Car className="w-4 h-4 text-slate-500" />
                      </span>
                    )}
                  </span>
                  <span className="flex-1 font-medium">{b.ar}</span>
                  <span className="text-sm text-slate-400" dir="ltr">{b.en}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
