import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full h-9 px-3 text-sm rounded-lg border border-slate-300 bg-white",
        "placeholder:text-slate-400",
        "focus-ring",
        "disabled:bg-slate-50 disabled:text-slate-400",
        className
      )}
      {...props}
    />
  )
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
