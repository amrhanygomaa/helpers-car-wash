import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type Tone =
  | "slate"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "indigo"
  | "emerald"
  | "rose";

const tones: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-green-50 text-green-700 border-green-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
};

export function Badge({
  tone = "slate",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; children?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap",
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
