import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Eye, EyeOff, MessageCircle } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { Dialog } from "../components/ui/Dialog";
import { useSettings } from "../store/SettingsContext";
import type { LoginResult } from "../types";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useSettings();
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
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showPaidNotice, setShowPaidNotice] = useState(false);
  const [showFreeNotice, setShowFreeNotice] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [verifyPhone, setVerifyPhone] = useState("");
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
    setFailedAttempts((prev) => prev + 1);
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

  const checkFreeRequestLimit = () => {
    const savedStr = localStorage.getItem("freeSupportRequestDate");
    if (!savedStr) return { used: false, daysLeft: 0 };
    const savedTime = parseInt(savedStr, 10);
    if (isNaN(savedTime)) return { used: false, daysLeft: 0 };
    const daysElapsed = (Date.now() - savedTime) / (1000 * 60 * 60 * 24);
    if (daysElapsed >= 45) {
      return { used: false, daysLeft: 0 };
    }
    return { used: true, daysLeft: Math.ceil(45 - daysElapsed) };
  };

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

    const registeredPhone = settings?.ownerPhone?.trim();
    if (registeredPhone) {
      if (!verifyPhone.trim()) {
        toast.error("رقم التحقق مطلوب", "يرجى إدخال رقم واتساب المالك للتحقق.");
        return;
      }
      const cleanRegistered = registeredPhone.replace(/[^\d]/g, "");
      const cleanVerify = verifyPhone.trim().replace(/[^\d]/g, "");
      if (cleanVerify !== cleanRegistered) {
        toast.error(
          "رقم غير مطابق",
          "رقم واتساب المالك المدخل غير مطابق للرقم المسجل في النظام! يرجى إدخال الرقم الصحيح لحماية بيانات المحل."
        );
        return;
      }
    }

    const { used, daysLeft } = checkFreeRequestLimit();
    if (used) {
      setDaysRemaining(daysLeft);
      setShowPaidNotice(true);
    } else {
      setShowFreeNotice(true);
    }
  }

  function proceedWithFreeRequest() {
    setShowFreeNotice(false);
    localStorage.setItem("freeSupportRequestDate", Date.now().toString());

    const currentMachineCode = machineCode || "غير متاح";
    const company = settings.companyNameAr || settings.companyName || "غير محدد";
    const ownerName = settings.ownerName || "غير محدد";
    const registeredPhone = settings.ownerPhone || "غير محدد";
    const enteredPhone = verifyPhone.trim() || "غير محدد";

    const text = `مرحباً، أود طلب كود الدعم المجاني الخاص باستعادة دخول المدير (مرة واحدة كل 45 يوم).
بيانات التحقق والترخيص:
- اسم المالك: ${ownerName}
- اسم الشركة/المحل: ${company}
- كود الجهاز: ${currentMachineCode}
- رقم الواتساب المسجل: ${registeredPhone}
- الرقم الذي يتم الإرسال منه: ${enteredPhone}
- اسم الدخول الحالي: ${username.trim() || "غير محدد"}`;

    const message = encodeURIComponent(text);
    window.open(`https://wa.me/201118445625?text=${message}`, "_blank", "noopener,noreferrer");
  }

  function openPaidSupportWhatsApp() {
    const currentMachineCode = machineCode || "غير متاح";
    const company = settings.companyNameAr || settings.companyName || "غير محدد";
    const ownerName = settings.ownerName || "غير محدد";
    const registeredPhone = settings.ownerPhone || "غير محدد";
    const enteredPhone = verifyPhone.trim() || "غير محدد";

    const text = `مرحباً، أود الحصول على كود دعم مدفوع لاستعادة دخول المدير (لقد استنفدت المحاولة المجانية).
بيانات التحقق والترخيص:
- اسم المالك: ${ownerName}
- اسم الشركة/المحل: ${company}
- كود الجهاز: ${currentMachineCode}
- رقم الواتساب المسجل: ${registeredPhone}
- الرقم الذي يتم الإرسال منه: ${enteredPhone}
- اسم الدخول الحالي: ${username.trim() || "غير محدد"}`;

    const message = encodeURIComponent(text);
    window.open(`https://wa.me/201118445625?text=${message}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className="min-h-screen grid md:grid-cols-2 bg-slate-100"
      dir="rtl"
    >
      <div className="hidden md:flex relative bg-gradient-to-br from-brand-700 to-brand-900 text-white p-10 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 grid place-items-center font-bold overflow-hidden">
            <img src="./helpers_tech_logo.png" alt="Helpers Technologies" className="w-full h-full object-contain p-1" />
          </div>
          <div>
            <div className="font-semibold">توب جير لغسيل السيارات</div>
            <div className="text-xs text-white/70">Top Gear Car Wash</div>
          </div>
        </div>
        <div className="space-y-3 max-w-md">
          <Boxes className="w-10 h-10 text-white/80" />
          <h2 className="text-3xl font-bold leading-tight">
            نظام متكامل لإدارة غسيل السيارات
          </h2>
          <p className="text-white/80 text-sm leading-relaxed">
            تنظيم طابور الغسيل، إدارة المركبات والخدمات، فواتير الغسيل،
            تتبع المفاتيح، وتقارير الأداء اليومية — بديل حقيقي للدفاتر الورقية.
          </p>
          <ul className="text-sm text-white/80 space-y-1 mt-4">
            <li>• استقبال السيارات وإدارة طابور الغسيل</li>
            <li>• فواتير خدمات سريعة وطباعة احترافية</li>
            <li>• تتبع الموظف المنفّذ لكل خدمة وعمولته</li>
            <li>• خصم خامات المغسلة من المخزون تلقائياً</li>
          </ul>
        </div>
        <div className="text-xs text-white/60">
          نظام مرخص ومعتمد — توب جير لغسيل السيارات
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-6 min-h-screen relative">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-card p-6 space-y-5"
        >
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
                placeholder="أدخل كلمة المرور"
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
              className={`w-full text-center transition-all ${
                failedAttempts >= 2
                  ? "text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg py-2.5 hover:bg-rose-100"
                  : "text-xs text-slate-500 hover:text-brand-700 underline"
              }`}
            >
              نسيت بيانات الدخول؟ استعادة دخول المدير بكود دعم مؤقت
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
              {settings.ownerPhone ? (
                <Field label="رقم واتساب المالك (للتحقق والأمان)" required hint="أدخل رقم المالك المسجل في إعدادات النظام للمتابعة">
                  <Input
                    value={verifyPhone}
                    onChange={(e) => setVerifyPhone(e.target.value)}
                    placeholder="مثال: +201118445625"
                  />
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

      <Dialog
        open={showFreeNotice}
        onClose={() => setShowFreeNotice(false)}
        title="💡 توضيح هام"
      >
        <div className="space-y-4 text-sm text-slate-700 leading-relaxed text-right" dir="rtl">
          <p>
            يحق لك طلب كود الدعم لاستعادة الحساب <strong>مرة واحدة مجاناً</strong>.
          </p>
          <p>
            المحاولات المجانية تتجدد كل <strong>45 يوماً</strong>، والطلبات الإضافية خلال هذه الفترة تكون مدفوعة.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowFreeNotice(false)}>
              إلغاء
            </Button>
            <Button onClick={proceedWithFreeRequest}>
              طلب الكود المجاني ومتابعة للواتساب
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={showPaidNotice}
        onClose={() => setShowPaidNotice(false)}
        title="⚠️ تنبيه استنفاد المحاولات"
      >
        <div className="space-y-4 text-sm text-slate-700 leading-relaxed text-right" dir="rtl">
          <p>
            لقد استنفدت محاولتك المجانية بالفعل (المحاولات المجانية تتجدد كل 45 يوم).
          </p>
          <p className="text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between">
            <span>⏳ متبقي على التجديد المجاني:</span>
            <strong>{daysRemaining} يوم</strong>
          </p>
          <p className="font-bold text-rose-600">
            برجاء التواصل مع الدعم على الواتس لطلب الكود وإتمام عملية الدفع.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowPaidNotice(false)}>
              إلغاء
            </Button>
            <Button
              className="border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
              onClick={() => {
                setShowPaidNotice(false);
                openPaidSupportWhatsApp();
              }}
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              تواصل للدفع واستلام الكود
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
