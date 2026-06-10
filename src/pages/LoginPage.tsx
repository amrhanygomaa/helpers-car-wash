import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Eye, EyeOff, MessageCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import type { LoginResult } from "../types";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportCode, setSupportCode] = useState("");
  const [supportUsername, setSupportUsername] = useState("");
  const [supportPassword, setSupportPassword] = useState("");
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportCodeRequesting, setSupportCodeRequesting] = useState(false);
  const [machineCode, setMachineCode] = useState("");
  const [lockRemaining, setLockRemaining] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const submitInFlight = useRef(false);

  useEffect(() => {
    if (lockRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setLockRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockRemaining]);

  useEffect(() => {
    if (!supportOpen || !window.desktopAPI?.license || machineCode) return;
    void window.desktopAPI.license.getMachineCode().then(setMachineCode).catch(() => {
      setMachineCode("");
    });
  }, [supportOpen, machineCode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitInFlight.current) return;
    if (!username.trim()) return;
    if (lockRemaining > 0) {
      toast.error("الحساب مقفول مؤقتاً", `حاول مرة أخرى بعد ${lockRemaining} ثانية`);
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    
    let result: LoginResult = { ok: false, error: "invalid_credentials" };
    try {
      result = await login(username.trim(), password);
    } catch {
      // ignore
    }

    if (result.ok) {
      toast.success("تم تسجيل الدخول", "مرحباً بك في النظام");
      navigate("/", { replace: true });
      return;
    }

    if (result.error === "rate_limited") {
      const seconds = result.remainSeconds ?? 60;
      setLockRemaining(seconds);
      toast.error("تم قفل الحساب مؤقتاً", `محاولات فاشلة كثيرة. حاول مرة أخرى بعد ${seconds} ثانية.`);
    } else {
      const attemptsText =
        result.attemptsRemaining !== undefined
          ? `المتبقي قبل القفل: ${result.attemptsRemaining} محاولات.`
          : "بعد 5 محاولات فاشلة سيتم قفل الحساب لمدة دقيقة.";
      toast.error("فشل تسجيل الدخول", `اسم الدخول أو كلمة المرور غير صحيحة. ${attemptsText}`);
    }
    submitInFlight.current = false;
    setSubmitting(false);
  }

  async function resetOwnerPassword() {
    if (!window.desktopAPI?.auth) return;
    if (!supportCode.trim() || !supportPassword || !supportUsername.trim()) {
      toast.error("بيانات ناقصة", "أدخل كود الدعم وبيانات المدير الجديدة");
      return;
    }
    setSupportSubmitting(true);
    const cleanSupportCode = supportCode.replace(/\s+/g, "").trim();
    const result = await window.desktopAPI.auth.resetOwnerPassword(
      cleanSupportCode,
      supportUsername.trim(),
      supportPassword
    );
    setSupportSubmitting(false);
    if (result.ok) {
      toast.success("تم تحديث بيانات المدير");
      setSupportOpen(false);
      setSupportCode("");
      setSupportUsername("");
      setSupportPassword("");
    } else {
      const messages: Record<NonNullable<typeof result.error>, string> = {
        invalid_support_code: "الكود غير صحيح أو تم توليده بمفتاح مختلف. أعد تشغيل التطبيق لو تم تحديث المفتاح العام.",
        machine_mismatch: "الكود صادر لجهاز مختلف. استخدم كود الجهاز الظاهر في هذه الشاشة.",
        support_code_expired: "كود الدعم منتهي الصلاحية. ولّد كود دعم جديد.",
        owner_missing: "لا يوجد مدير مسجل على هذا الجهاز.",
        invalid_input: "اسم المدير وكلمة المرور الجديدة مطلوبان.",
        rate_limited: `محاولات كثيرة غير صحيحة. حاول مرة أخرى بعد ${result.remainSeconds ?? 600} ثانية.`,
      };
      toast.error("فشل كود الدعم", messages[result.error ?? "invalid_support_code"]);
    }
  }

  async function requestSupportCode() {
    setSupportCodeRequesting(true);
    let currentMachineCode = machineCode || "غير متاح";
    try {
      if (window.desktopAPI?.license) {
        currentMachineCode = await window.desktopAPI.license.getMachineCode();
        setMachineCode(currentMachineCode);
      }
      if (navigator.clipboard && currentMachineCode !== "غير متاح") {
        await navigator.clipboard.writeText(currentMachineCode);
        toast.success("تم نسخ كود الجهاز", "أرسله للدعم للحصول على كود الاستعادة");
      }
    } catch {
      // The WhatsApp message below still gives support enough context.
    } finally {
      setSupportCodeRequesting(false);
    }

    const message = encodeURIComponent(
      `مرحباً، نسيت كود الدعم الخاص باستعادة دخول المدير.\nكود الجهاز: ${currentMachineCode}\nاسم الدخول الحالي: ${username.trim() || "غير محدد"}`
    );
    window.open(`https://wa.me/201118445625?text=${message}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className="min-h-screen grid md:grid-cols-2 bg-slate-50"
      dir="rtl"
    >
      <div className="hidden md:flex relative bg-gradient-to-br from-brand-700 to-brand-900 text-white p-10 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 grid place-items-center font-bold overflow-hidden">
            <img src="./helpers_tech_logo.png" alt="Helpers Technologies" className="w-full h-full object-contain p-1" />
          </div>
          <div>
            <div className="font-semibold">شركة هيلبيرز تكنولوجي</div>
            <div className="text-xs text-white/70">Helpers Technologies</div>
          </div>
        </div>
        <div className="space-y-3 max-w-md">
          <Boxes className="w-10 h-10 text-white/80" />
          <h2 className="text-3xl font-bold leading-tight">
            نظام متكامل لإدارة المخزون والمبيعات
          </h2>
          <p className="text-white/80 text-sm leading-relaxed">
            تحكم كامل في المخزون، تنبيهات الصلاحية، فواتير الشراء والبيع،
            الخزينة، وتقارير عملية — بديل حقيقي للدفاتر الورقية.
          </p>
          <ul className="text-sm text-white/80 space-y-1 mt-4">
            <li>• إدخال فواتير سريع وسلس</li>
            <li>• طباعة فواتير A4 احترافية</li>
            <li>• متابعة أرصدة العملاء والموردين</li>
            <li>• تنبيهات النقص والصلاحية</li>
          </ul>
        </div>
        <div className="text-xs text-white/60">
          نظام مرخص ومعتمد — شركة هيلبيرز تكنولوجي
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-6 min-h-screen relative">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-card p-6 space-y-5"
        >
          <div className="flex items-center gap-2 text-brand-700">
            <ShieldCheck className="w-5 h-5" />
            <div className="text-sm font-medium">بوابة الدخول الآمنة</div>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">أهلاً بك مجدداً 👋</h1>
            <p className="text-sm text-slate-500 mt-1">
              يرجى إدخال بيانات الاعتماد الخاصة بك للوصول إلى النظام.
            </p>
          </div>
          <Field label="اسم الدخول" required>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Login username"
            />
          </Field>
          <Field label="كلمة المرور" required>
            <div className="relative">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                className="pl-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting || lockRemaining > 0}
          >
            {lockRemaining > 0
              ? `الحساب مقفول ${lockRemaining} ثانية`
              : submitting
              ? "جاري التحقق..."
              : "تسجيل الدخول"}
          </Button>
          {lockRemaining > 0 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              تم قفل تسجيل الدخول مؤقتاً بسبب محاولات فاشلة كثيرة.
            </div>
          ) : null}
          <div className="text-[10px] text-slate-400 text-center">
            هذا النظام محمي ومشفر — Helpers Technologies © 2026
          </div>
          <a
            href="https://wa.me/201118445625"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full h-9 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            تواصل مع الدعم الفني عبر واتساب
          </a>
          {window.desktopAPI?.auth && (
            <button
              type="button"
              onClick={() => setSupportOpen((v) => !v)}
              className="w-full text-[11px] text-slate-400 hover:text-brand-700 transition-colors"
            >
              استعادة دخول المدير بكود دعم مؤقت
            </button>
          )}
          {supportOpen && (
            <div className="border border-slate-200 rounded-xl p-3 space-y-3 bg-slate-50">
              {machineCode ? (
                <Field label="كود الجهاز الحالي">
                  <div className="flex gap-2">
                    <Input value={machineCode} readOnly className="font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard?.writeText(machineCode);
                        toast.success("تم نسخ كود الجهاز");
                      }}
                    >
                      نسخ
                    </Button>
                  </div>
                </Field>
              ) : null}
              <Field label="كود الدعم">
                <Input
                  value={supportCode}
                  onChange={(e) => setSupportCode(e.target.value.replace(/\s+/g, ""))}
                  placeholder="HTSUP..."
                />
              </Field>
              <Field label="اسم دخول المدير الجديد">
                <Input
                  value={supportUsername}
                  onChange={(e) => setSupportUsername(e.target.value)}
                />
              </Field>
              <Field label="كلمة المرور الجديدة">
                <Input
                  type="password"
                  value={supportPassword}
                  onChange={(e) => setSupportPassword(e.target.value)}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={resetOwnerPassword}
                disabled={supportSubmitting}
              >
                {supportSubmitting ? "جاري التحقق..." : "تحديث بيانات المدير"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-brand-700"
                onClick={requestSupportCode}
                disabled={supportCodeRequesting}
              >
                {supportCodeRequesting ? "جاري تجهيز الطلب..." : "نسيت كود الدعم؟ تواصل مع الدعم"}
              </Button>
            </div>
          )}
        </form>

        <footer className="absolute bottom-6 left-0 right-0 px-6">
          <div className="flex flex-col items-center gap-2 text-[10px] text-slate-400">
            <div className="font-bold text-slate-500">© 2026 جميع الحقوق محفوظة لشركة Helpers Technologies</div>
            <div className="flex items-center gap-4">
              <a href="https://wa.me/201118445625" target="_blank" rel="noreferrer" className="hover:text-emerald-600 transition-colors">واتساب: +201118445625</a>
              <span>|</span>
              <a href="https://helpers-tech.com/" target="_blank" rel="noreferrer" className="hover:text-brand-600 transition-colors">helpers-tech.com</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
