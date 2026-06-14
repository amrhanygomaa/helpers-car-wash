import {
  forwardRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../../lib/utils";

function isZeroLikeInputValue(value: InputHTMLAttributes<HTMLInputElement>["value"]) {
  if (value === 0) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed !== "" && Number(trimmed) === 0;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  (
    {
      className,
      type,
      value,
      placeholder,
      onChange,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const isControlledNumber = type === "number" && value !== undefined;
    const [draftValue, setDraftValue] = useState<string | null>(null);
    const showZeroAsPlaceholder = isControlledNumber && isZeroLikeInputValue(value);
    const inputValue =
      isControlledNumber && draftValue !== null
        ? draftValue
        : showZeroAsPlaceholder
        ? ""
        : value;

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      if (isControlledNumber) setDraftValue(event.target.value);
      onChange?.(event);
    }

    function handleFocus(event: FocusEvent<HTMLInputElement>) {
      if (isControlledNumber) {
        setDraftValue(showZeroAsPlaceholder ? "" : String(value ?? ""));
      }
      onFocus?.(event);
    }

    function handleBlur(event: FocusEvent<HTMLInputElement>) {
      if (isControlledNumber) setDraftValue(null);
      onBlur?.(event);
    }

    return (
      <input
        ref={ref}
        type={type}
        value={inputValue}
        placeholder={showZeroAsPlaceholder ? placeholder ?? "0" : placeholder}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          "w-full h-9 px-3 text-sm rounded-lg border border-slate-300 bg-white",
          "placeholder:text-slate-400",
          "focus-ring",
          "disabled:bg-slate-50 disabled:text-slate-400",
          type === "number" && "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full min-h-[80px] px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white",
      "placeholder:text-slate-400 focus-ring",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "w-full h-9 px-3 text-sm rounded-lg border border-slate-300 bg-white",
      "focus-ring",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({
  label,
  hint,
  error,
  children,
  required,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label className="block text-xs font-medium text-slate-600">
          {label}
          {required ? <span className="text-red-500 mx-1">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <div className="text-xs text-red-600">{error}</div>
      ) : hint ? (
        <div className="text-xs text-slate-400">{hint}</div>
      ) : null}
    </div>
  );
}
