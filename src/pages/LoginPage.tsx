import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, ShieldCheck } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

export function LoginPage() {
  const { login, settings } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setSubmitting(true);
    setTimeout(() => {
      const success = login(username.trim(), password);
      if (success) {
        toast.success("تم تسجيل الدخول", "مرحباً بك في النظام");
        navigate("/", { replace: true });
      } else {
        toast.error("فشل تسجيل الدخول", "اسم المستخدم أو كلمة المرور غير صحيحة");
        setSubmitting(false);
      }
    }, 350);
  }

  return (
    <div
      className="min-h-screen grid md:grid-cols-2 bg-slate-50"
      dir="rtl"
    >
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
          نظام مرخص ومعتمد — {settings.arabicLabels ? settings.companyNameAr : settings.companyName}
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
          <Field label="اسم المستخدم" required>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
          </Field>
          <Field label="كلمة المرور" required>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
            />
          </Field>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? "جاري التحقق..." : "تسجيل الدخول"}
          </Button>
          <div className="text-[10px] text-slate-400 text-center">
            هذا النظام محمي ومشفر — Helpers Technologies © 2026
          </div>
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
