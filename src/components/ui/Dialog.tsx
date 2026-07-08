import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "md+" | "lg" | "xl" | "2xl";
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthClass =
    width === "sm"
      ? "max-w-sm"
      : width === "md"
      ? "max-w-md"
      : width === "md+"
      ? "max-w-lg"
      : width === "lg"
      ? "max-w-2xl"
      : width === "xl"
      ? "max-w-3xl"
      : "max-w-5xl";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      <div
        role="dialog"
        className={cn(
          "relative w-full bg-white rounded-2xl shadow-xl border border-slate-200 animate-fadeIn flex flex-col max-h-[90vh]",
          widthClass
        )}
      >
        {title || subtitle ? (
          <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-100">
            <div className="min-w-0 flex-1">
              {title ? (
                <div className="font-semibold text-slate-900">{title}</div>
              ) : null}
              {subtitle ? (
                <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
              ) : null}
            </div>
            <Button size="icon" variant="ghost" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : null}
        <div className="p-4 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "تأكيد",
  message,
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  variant = "primary",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger";
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-700">{message}</div>
    </Dialog>
  );
}
