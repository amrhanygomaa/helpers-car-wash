import { useState, type FormEvent } from "react";
import { ShieldCheck, UserPlus, FolderOpen, Database, FileText } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

export function FirstRunSetupPage() {
  const { createOwner } = useAuth();
  const { settings, updateSettings } = useSettings();
  const toast = useToast();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const [invoicesSavePath, setInvoicesSavePath] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function pickBackupFolder() {
    const dir = await window.desktopAPI?.backup?.selectDirectory();
    if (dir) setBackupPath(dir);
  }
  async function pickInvoicesFolder() {
    const dir = await window.desktopAPI?.setup?.selectDirectory();
    if (dir) setInvoicesSavePath(dir);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || password.length < 6) {
      toast.error("بيانات غير مكتملة", "كلمة المرور يجب ألا تقل عن 6 أحرف");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    if (!backupPath.trim()) {
      toast.error("مطلوب", "اختر مجلد النسخ الاحتياطي التلقائي");
      return;
    }
    if (!invoicesSavePath.trim()) {
      toast.error("مطلوب", "اختر مجلد حفظ الفواتير (PDF)");
      return;
    }

    setSubmitting(true);
    const ok = await createOwner(username.trim(), password);
    if (ok) {
      // Persist now — createOwner has set the owner session, so storage writes
      // are authorized. The owner can change these later from الإعدادات.
      updateSettings({ backupPath: backupPath.trim(), invoicesSavePath: invoicesSavePath.trim() });
      toast.success("تم إنشاء المدير", "تم فتح النظام بالحساب الجديد");
    } else {
      setSubmitting(false);
      toast.error("فشل إنشاء المدير", "تأكد أن الحساب غير موجود بالفعل");
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-slate-50" dir="rtl">
      <div className="hidden md:flex relative bg-gradient-to-br from-brand-700 to-brand-900 text-white p-10 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 grid place-items-center font-bold overflow-hidden">
            {settings.logoImage ? (
              <img src={settings.logoImage} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              settings.logoText
            )}
          </div>
          <div>
            <div className="font-semibold">{settings.companyNameAr}</div>
            <div className="text-xs text-white/70">{settings.companyName}</div>
          </div>
        </div>
        <div className="space-y-4 max-w-md">
          <ShieldCheck className="w-12 h-12 text-white/85" />
          <h1 className="text-3xl font-bold leading-tight">إعداد المدير لأول مرة</h1>
          <p className="text-white/80 text-sm leading-relaxed">
            لا يوجد حساب افتراضي داخل النسخة. هذا الحساب سيكون مالك النظام وصاحب
            صلاحيات المستخدمين والإعدادات.
          </p>
        </div>
        <div className="text-xs text-white/60">Helpers Technologies © 2026</div>
      </div>

      <div className="flex flex-col items-center justify-center p-6 min-h-screen">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-card p-6 space-y-5"
        >
          <div className="flex items-center gap-2 text-brand-700">
            <UserPlus className="w-5 h-5" />
            <div className="text-sm font-medium">حساب المدير</div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">إنشاء حساب المالك</h2>
            <p className="text-sm text-slate-500 mt-1">
              الحساب سيتم حفظه محلياً بكلمة مرور مشفرة.
            </p>
          </div>

          <Field label="اسم الدخول" required>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="كلمة المرور" required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="تأكيد كلمة المرور" required>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>

          <div className="pt-3 border-t border-slate-100 space-y-4">
            <div className="text-xs text-slate-500 leading-relaxed">
              لحماية بياناتك، حدِّد مجلدين مطلوبين لأول مرة (يمكن تغييرهما لاحقاً من الإعدادات).
            </div>

            <Field label="مجلد النسخ الاحتياطي التلقائي" required>
              <div className="flex gap-2">
                <Input
                  value={backupPath}
                  readOnly
                  placeholder="اختر مجلداً (محلي / خارجي / شبكة)..."
                  className="bg-slate-50 font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={pickBackupFolder}>
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                <Database className="w-3 h-3" /> تُحفظ نسخة كاملة من البيانات تلقائياً في هذا المجلد.
              </div>
            </Field>

            <Field label="مجلد حفظ الفواتير (PDF)" required>
              <div className="flex gap-2">
                <Input
                  value={invoicesSavePath}
                  readOnly
                  placeholder="اختر مجلداً..."
                  className="bg-slate-50 font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={pickInvoicesFolder}>
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                <FileText className="w-3 h-3" /> الوجهة الافتراضية لحفظ الفواتير المطبوعة كـ PDF.
              </div>
            </Field>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? "جاري الإنشاء..." : "إنشاء المدير وفتح النظام"}
          </Button>
        </form>
      </div>
    </div>
  );
}
