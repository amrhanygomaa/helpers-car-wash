import { useCallback, type ChangeEvent, type InputHTMLAttributes } from "react";
import { cn, normalizeEgyptPlateNumber } from "../../lib/utils";

type PlateNumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> & {
  /** Fires with the already-normalized plate string. */
  onPlateChange?: (normalized: string) => void;
  /** Standard controlled-input onChange — value is the *raw* input value. */
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
};

/**
 * Egyptian license-plate input that auto-formats as the user types.
 *
 * Splits Arabic letters with spaces and groups digits together so the user
 * always sees the canonical format (e.g. "ن ه 7535") even if they type
 * "نه7535".
 */
export function PlateNumberInput({
  className,
  onPlateChange,
  onChange,
  value,
  defaultValue,
  ...rest
}: PlateNumberInputProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const normalized = normalizeEgyptPlateNumber(raw);

      // We rewrite the value in the DOM directly so the cursor stays sane.
      // React will reconcile on the next render anyway.
      e.target.value = normalized;

      onChange?.(e);
      onPlateChange?.(normalized);
    },
    [onChange, onPlateChange],
  );

  return (
    <input
      dir="rtl"
      inputMode="text"
      autoComplete="off"
      placeholder="ن هـ 7535"
      {...rest}
      value={value !== undefined ? normalizeEgyptPlateNumber(String(value)) : undefined}
      defaultValue={
        defaultValue !== undefined
          ? normalizeEgyptPlateNumber(String(defaultValue))
          : undefined
      }
      onChange={handleChange}
      className={cn(
        "w-full h-9 px-3 text-sm rounded-lg border border-slate-300 bg-white",
        "placeholder:text-slate-400",
        "focus-ring",
        "tracking-widest font-semibold text-center text-base",
        "disabled:bg-slate-50 disabled:text-slate-400",
        className,
      )}
    />
  );
}
