import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Search, UserRound, X } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Customer } from "../../types";

const MAX_RESULTS = 20;

function matchesQuery(customer: Customer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    customer.name.toLowerCase().includes(q) ||
    (customer.phone ?? "").includes(q) ||
    (customer.code ?? "").toLowerCase().includes(q)
  );
}

/**
 * Searchable customer picker: type to filter by name, phone, or customer
 * code. When nothing matches, offers to open the "add customer" dialog or to
 * proceed as a walk-in guest without saving a permanent customer record.
 */
export function CustomerCombobox({
  customers,
  selectedCustomer,
  onPick,
  onClear,
  onAddNew,
  onGuest,
  placeholder = "ابحث بالاسم أو رقم الهاتف أو كود العميل…",
  autoFocus,
}: {
  customers: Customer[];
  selectedCustomer: Customer | undefined;
  onPick: (customer: Customer) => void;
  onClear: () => void;
  onAddNew: (query: string) => void;
  onGuest: (query: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(selectedCustomer?.name ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Controlled by the parent's selection (e.g. reset, or created via dialog).
  useEffect(() => {
    setText(selectedCustomer?.name ?? "");
  }, [selectedCustomer]);

  const results = customers.filter((c) => matchesQuery(c, text)).slice(0, MAX_RESULTS);
  const showActions = text.trim().length > 0;
  const actionCount = showActions ? 2 : 0;

  function pick(customer: Customer) {
    onPick(customer);
    setText(customer.name);
    setOpen(false);
  }

  function change(value: string) {
    setText(value);
    setHighlight(0);
    setOpen(true);
    if (selectedCustomer && value !== selectedCustomer.name) onClear();
  }

  function clear() {
    setText("");
    onClear();
    setOpen(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") setOpen(true);
      return;
    }
    const totalRows = results.length + actionCount;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(totalRows - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight < results.length) {
        if (results[highlight]) pick(results[highlight]);
      } else if (showActions) {
        const actionIndex = highlight - results.length;
        if (actionIndex === 0) {
          onAddNew(text.trim());
        } else {
          onGuest(text.trim());
        }
        setOpen(false);
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className="relative">
        <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400 pointer-events-none" />
        <input
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => change(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full h-11 ps-9 pe-9 text-base rounded-lg border border-slate-300 bg-white",
            "placeholder:text-slate-400 focus-ring"
          )}
        />
        {text ? (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            title="مسح"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute z-30 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">
              {text.trim() ? "لا يوجد عميل مطابق" : "اكتب للبحث عن عميل"}
            </div>
          ) : (
            <ul>
              {results.map((customer, i) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(customer)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-start",
                      i === highlight ? "bg-brand-50 text-brand-800" : "text-slate-700"
                    )}
                  >
                    <span className="w-8 h-8 shrink-0 rounded-full bg-slate-100 grid place-items-center">
                      <UserRound className="w-4 h-4 text-slate-500" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{customer.name}</span>
                      <span className="block text-xs text-slate-400 truncate" dir="ltr">
                        {[customer.code, customer.phone].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showActions ? (
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onAddNew(text.trim());
                  setOpen(false);
                }}
                onMouseEnter={() => setHighlight(results.length)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-700",
                  highlight === results.length ? "bg-brand-50" : ""
                )}
              >
                <Plus className="w-4 h-4" /> إضافة عميل جديد باسم "{text.trim()}"
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onGuest(text.trim());
                  setOpen(false);
                }}
                onMouseEnter={() => setHighlight(results.length + 1)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700",
                  highlight === results.length + 1 ? "bg-amber-50" : ""
                )}
              >
                <UserRound className="w-4 h-4" /> تسجيل "{text.trim()}" كزائر (بدون حفظ بيانات)
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
