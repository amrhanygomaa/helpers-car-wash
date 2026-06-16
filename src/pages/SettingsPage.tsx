import { useEffect, useState } from "react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { Dialog } from "../components/ui/Dialog";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { lsGet } from "../lib/storage";
import { FEATURES, defaultFeatureState, isAllowedByLicense, type FeatureKey } from "../lib/features";
import { Save, Printer, Download, Upload, Database, FileSpreadsheet, ShieldCheck, Clock, Image as ImageIcon, Trash2, FolderOpen, Boxes, Lock, Copy, KeyRound, MessageCircle } from "lucide-react";

const SUPPORT_WHATSAPP = "201118445625";

const PLAN_LABELS: Record<string, string> = {
  basic: "الباقة الأساسية",
  pro: "الباقة الاحترافية",
  full: "الباقة الكاملة",
  custom: "باقة مخصّصة",
};

function subscriptionDurationLabel(type: string, months: number): string {
  if (type === "lifetime") return "مدى الحياة";
  const m = Number(months) || 0;
  if (m <= 0) return "غير محددة";
  if (m % 12 === 0) {
    const y = m / 12;
    return y === 1 ? "سنة كاملة" : y === 2 ? "سنتان" : `${y} سنوات`;
  }
  return `${m} شهر`;
}

function planDisplayLabel(license?: { plan?: string; features?: string[] } | null): string {
  if (!license) return "—";
  if (license.plan && PLAN_LABELS[license.plan]) return PLAN_LABELS[license.plan];
  const f = license.features;
  if (Array.isArray(f) && f.length > 0) return `${f.length} ميزة مفعّلة`;
  return "الباقة الكاملة";
}

export function SettingsPage() {
  const { settings, updateSettings, exportBackup, importBackup, backupToPath, exportToExcel, licenseStatus, activateLicense } = useApp();
  const toast = useToast();
  const [form, setForm] = useState(settings);
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [newSerial, setNewSerial] = useState("");
  const [applyingSerial, setApplyingSerial] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  async function copyMachineCode() {
    const code = licenseStatus?.machineCode;
    if (!code) return toast.error("كود الجهاز غير متاح");
    await navigator.clipboard.writeText(code);
    toast.success("تم نسخ كود الجهاز");
  }

  function buildLicenseRequest() {
    const code = licenseStatus?.machineCode ?? "غير متاح";
    const sub = subscriptionDurationLabel(form.subscriptionType, form.subscriptionMonths);
    const plan = planDisplayLabel(licenseStatus?.license);
    const subLeft =
      form.subscriptionType === "limited"
        ? Math.max(0, getRemainingDays(form.subscriptionStartDate, form.subscriptionMonths)) + " يوم"
        : "—";
    const war =
      form.warrantyType === "none"
        ? "بدون ضمان"
        : Math.max(0, getRemainingDays(form.warrantyStartDate, form.warrantyMonths)) + " يوم";
    return [
      "طلب تجديد / ترقية ترخيص — Helpers Warehouse System",
      "العميل: " + (form.companyNameAr || form.companyName || "—"),
      "كود الجهاز: " + code,
      "مدة الاشتراك: " + sub,
      "الباقة الحالية: " + plan,
      "المتبقي في الاشتراك: " + subLeft,
      "حالة الضمان: " + war,
      "",
      "المطلوب: (تجديد اشتراك / تمديد ضمان / ترقية باقة)",
    ].join("\n");
  }

  function openLicenseRequestWhatsapp() {
    const url = "https://wa.me/" + SUPPORT_WHATSAPP + "?text=" + encodeURIComponent(buildLicenseRequest());
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function applyNewSerial() {
    const serial = newSerial.trim();
    if (!serial) return toast.error("الصق السيريال أولاً");
    setApplyingSerial(true);
    const result = await activateLicense(serial);
    setApplyingSerial(false);
    if (result.ok) {
      toast.success("تم تحديث الترخيص", "تم تطبيق السيريال الجديد — الاشتراك/الضمان/الباقة محدّثة");
      setNewSerial("");
      setLicenseDialogOpen(false);
      return;
    }
    const messages: Record<string, string> = {
      expired: "السيريال منتهي الصلاحية",
      machine_mismatch: "هذا السيريال مخصص لجهاز آخر",
      clock_tampered: "تم اكتشاف تغيير غير آمن في تاريخ الجهاز",
      inactive: "السيريال غير صالح",
    };
    toast.error("فشل تطبيق السيريال", messages[result.status.state] || "السيريال غير صالح");
  }

  function save() {
    updateSettings(form);
    toast.success("تم حفظ الإعدادات");
  }

  async function backupNow() {
    const dir = form.backupPath?.trim();
    if (!dir) {
      toast.error("لم يتم تحديد مجلد", "اختر مجلد النسخ الاحتياطي أولاً");
      return;
    }
    if (dir !== settings.backupPath) updateSettings({ ...settings, backupPath: dir });
    const result = await backupToPath(dir);
    if (result.ok) {
      toast.success("تم النسخ الاحتياطي", result.path ?? dir);
      return;
    }
    const messages: Record<string, string> = {
      no_path: "لم يتم تحديد مجلد النسخ الاحتياطي",
      not_desktop: "هذه الميزة متاحة في تطبيق سطح المكتب فقط",
      path_not_found: "المجلد غير موجود أو غير متاح",
      not_authorized: "غير مصرح — سجّل الدخول كمالك",
      invalid_input: "بيانات غير صالحة",
      write_failed: "فشل الكتابة إلى المجلد",
    };
    toast.error("فشل النسخ الاحتياطي", messages[result.error ?? ""] ?? "حدث خطأ غير متوقع");
  }

  const license = licenseStatus?.license ?? null;
  const featureChecked = (key: FeatureKey) => form.features?.[key] ?? defaultFeatureState(key, license);
  const toggleFeature = (key: FeatureKey, value: boolean) =>
    setForm({ ...form, features: { ...(form.features ?? {}), [key]: value } });

  function getRemainingDays(startDate: string, months: number) {
    if (!startDate || months <= 0) return 0;
    const start = new Date(startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    const diff = end.getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <>
      <PageHeader
        title="الإعدادات"
        description="خيارات الشركة، الطباعة، والعملة"
        actions={
          <Button onClick={save}>
            <Save className="w-4 h-4" /> حفظ الإعدادات
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="بيانات الشركة" subtitle="تظهر في الفواتير وأعلى التطبيق" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-6 mb-4">
              <div className="relative group/logo">
                <div
                  className={`w-20 h-20 rounded-2xl border-4 border-white shadow-lg overflow-hidden flex items-center justify-center text-2xl ${
                    form.logoImage ? "bg-white" : "bg-gradient-to-br from-brand-600 to-brand-800 text-white font-bold"
                  }`}
                >
                  {form.logoImage ? (
                    <img src={form.logoImage} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    form.logoText || "HD"
                  )}
                </div>
                {form.logoImage && (
                  <button
                    onClick={() => setForm({ ...form, logoImage: "" })}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full shadow-md flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <div className="text-sm font-bold text-slate-900">شعار الشركة</div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setForm({ ...form, logoImage: reader.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <Button variant="outline" size="sm" className="gap-2">
                      <ImageIcon className="w-4 h-4" /> رفع صورة
                    </Button>
                  </div>
                  {!form.logoImage && (
                    <div className="text-[10px] text-slate-500">
                      سيتم استخدام الشعار النصي في حال عدم رفع صورة
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="الشعار النصي (في حال عدم وجود صورة)">
                <Input
                  value={form.logoText}
                  maxLength={3}
                  onChange={(e) => setForm({ ...form, logoText: e.target.value })}
                />
              </Field>
              <Field label="اسم الشركة بالعربية" required>
                <Input
                  value={form.companyNameAr}
                  onChange={(e) => setForm({ ...form, companyNameAr: e.target.value })}
                />
              </Field>
            </div>

            <Field label="اسم الشركة بالإنجليزية">
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </Field>
            <Field label="نص ذيل الفاتورة">
              <Textarea
                rows={3}
                value={form.invoiceFooter}
                onChange={(e) => setForm({ ...form, invoiceFooter: e.target.value })}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الإعدادات العامة" subtitle="العملة والتنبيهات" />
          <CardBody className="space-y-3">
            <Field label="العملة">
              <Select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="ج.م">جنيه مصري (ج.م)</option>
                <option value="ر.س">ريال سعودي (ر.س)</option>
                <option value="د.إ">درهم إماراتي (د.إ)</option>
                <option value="د.ك">دينار كويتي (د.ك)</option>
                <option value="$">دولار أمريكي ($)</option>
              </Select>
            </Field>
            <Field
              label="الحد الأدنى الافتراضي للمخزون"
              hint="يُستخدم كقيمة افتراضية عند إضافة منتج جديد"
            >
              <Input
                type="number"
                min={0}
                value={form.lowStockThreshold}
                onChange={(e) =>
                  setForm({ ...form, lowStockThreshold: Number(e.target.value) })
                }
              />
            </Field>
            <Field
              label="مدة تنبيه تأخر السداد"
              hint="المدة التي يُعتبر بعدها المورد متأخراً في السداد فتظهر تنبيهاته"
            >
              <Select
                value={String(form.paymentTermDays ?? 7)}
                onChange={(e) => setForm({ ...form, paymentTermDays: Number(e.target.value) })}
              >
                <option value="7">أسبوع (7 أيام)</option>
                <option value="14">أسبوعين (14 يوم)</option>
                <option value="30">شهر (30 يوم)</option>
                <option value="60">شهرين (60 يوم)</option>
                <option value="90">ثلاثة أشهر (90 يوم)</option>
              </Select>
            </Field>
            <Field label="واجهة عربية">
              <label className="flex items-center gap-2 h-9 text-sm">
                <input
                  type="checkbox"
                  checked={form.arabicLabels}
                  onChange={(e) => setForm({ ...form, arabicLabels: e.target.checked })}
                />
                عرض أسماء الشركة والقوائم بالعربية
              </label>
            </Field>
            <Field label="قفل الجلسة بعد عدم النشاط" hint="عدد الدقائق قبل قفل الشاشة تلقائياً — 0 لتعطيل الميزة">
              <Select
                value={String(form.idleLockMinutes ?? 0)}
                onChange={(e) => setForm({ ...form, idleLockMinutes: Number(e.target.value) })}
              >
                <option value="0">معطّل</option>
                <option value="5">5 دقائق</option>
                <option value="10">10 دقائق</option>
                <option value="15">15 دقيقة</option>
                <option value="30">30 دقيقة</option>
                <option value="60">ساعة كاملة</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-brand-600" />
                <span>المميزات والوحدات</span>
              </div>
            }
            subtitle="تحكّم في الوحدات الظاهرة للعميل — الوحدات المقفولة في الباقة لا يمكن تفعيلها"
          />
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {FEATURES.map((f) => {
                const allowed = isAllowedByLicense(f.key, license);
                const checked = allowed && featureChecked(f.key);
                return (
                  <label
                    key={f.key}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      allowed
                        ? "border-slate-200 hover:bg-slate-50 cursor-pointer"
                        : "border-slate-100 bg-slate-50/60 cursor-not-allowed"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={checked}
                      disabled={!allowed}
                      onChange={(e) => toggleFeature(f.key, e.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                        {f.label}
                        {!allowed && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                            <Lock className="w-3 h-3" /> غير متاح في الباقة
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{f.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              إخفاء وحدة هنا يزيلها من القائمة الجانبية ويمنع الوصول إليها. الباقة المرتبطة بالسيريال
              تحدّد الوحدات المتاحة أصلاً، ولا يمكن تجاوزها من هنا.
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="إعدادات الطباعة" subtitle="تنسيق الفاتورة المطبوعة" />
          <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="مقاس الورق">
              <Select
                value={form.printPaperSize}
                onChange={(e) =>
                  setForm({ ...form, printPaperSize: e.target.value as "A4" | "A5" })
                }
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
              </Select>
            </Field>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg p-3 md:col-span-2">
              <Printer className="w-5 h-5 text-slate-600" />
              <div className="text-sm text-slate-700">
                يتم إرسال الفاتورة للطباعة من داخل التطبيق مباشرة عند الضغط على زر "طباعة".
              </div>
            </div>
            <Field label="مجلد حفظ الفواتير (PDF)" className="md:col-span-3">
              <div className="flex gap-2">
                <Input
                  value={form.invoicesSavePath}
                  readOnly
                  placeholder="اختر مجلداً..."
                  className="bg-slate-50"
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (window.desktopAPI?.setup?.selectDirectory) {
                      const path = await window.desktopAPI.setup.selectDirectory();
                      if (path) setForm({ ...form, invoicesSavePath: path });
                    }
                  }}
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
            </Field>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="إعدادات النسخ الاحتياطي التلقائي" subtitle="جدولة حفظ البيانات تلقائياً" />
          <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="تفعيل النسخ التلقائي">
              <label className="flex items-center gap-2 h-9 text-sm">
                <input
                  type="checkbox"
                  checked={form.autoBackupEnabled}
                  onChange={(e) => setForm({ ...form, autoBackupEnabled: e.target.checked })}
                />
                نعم، قم بالحفظ تلقائياً
              </label>
            </Field>
            <Field label="تكرار النسخ">
              <Select
                value={form.autoBackupFrequency}
                disabled={!form.autoBackupEnabled}
                onChange={(e) =>
                  setForm({
                    ...form,
                    autoBackupFrequency: e.target.value as typeof form.autoBackupFrequency,
                  })
                }
              >
                <option value="daily">يومي</option>
                <option value="weekly">أسبوعي</option>
                <option value="monthly">شهري</option>
              </Select>
            </Field>
            <Field label="نسخة احتياطية عند إغلاق البرنامج" hint="يحفظ نسخة كاملة تلقائياً في المجلد المحدد قبل إغلاق التطبيق">
              <label className="flex items-center gap-2 h-9 text-sm">
                <input
                  type="checkbox"
                  checked={form.backupOnClose ?? true}
                  onChange={(e) => setForm({ ...form, backupOnClose: e.target.checked })}
                />
                نعم، احفظ نسخة عند الإغلاق
              </label>
            </Field>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <div className="text-xs text-blue-700 font-bold mb-1">آخر نسخة احتياطية:</div>
              <div className="text-sm text-blue-900 font-mono">
                {settings.lastBackupDate ? new Date(settings.lastBackupDate).toLocaleString("ar-EG") : "لم يتم الحفظ بعد"}
              </div>
            </div>
            <Field label="مجلد النسخ الاحتياطي (محلي / خارجي / شبكة)" className="md:col-span-2">
              <div className="flex gap-2">
                <Input
                  value={form.backupPath}
                  readOnly
                  placeholder="اختر مجلداً..."
                  className="bg-slate-50 font-mono text-xs"
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (window.desktopAPI?.backup?.selectDirectory) {
                      const path = await window.desktopAPI.backup.selectDirectory();
                      if (path) setForm({ ...form, backupPath: path });
                    } else {
                      toast.error("متاح في تطبيق سطح المكتب فقط");
                    }
                  }}
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
            </Field>
            <Field label="نسخ احتياطي فوري">
              <Button
                variant="outline"
                onClick={backupNow}
                disabled={!form.backupPath?.trim()}
                className="w-full justify-center"
              >
                <Database className="w-4 h-4" /> نسخ احتياطي الآن
              </Button>
            </Field>
            <div className="md:col-span-3 text-xs text-slate-500">
              يتم حفظ نسخة كاملة من البيانات (بصيغة JSON) في المجلد المحدد. يمكن استعادتها لاحقاً عبر "استيراد نسخة احتياطية".
              عند التفعيل، تُحفظ نسخة تلقائياً عند فتح البرنامج حسب التكرار المختار.
            </div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2 border-brand-100 bg-brand-50/10 relative group">
          <CardHeader title="بيانات الاشتراك والضمان" subtitle="تفاصيل الترخيص والدعم الفني الفعلي للنسخة" />
          <CardBody className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Subscription Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-brand-700 font-bold">
                  <ShieldCheck className="w-5 h-5" />
                  <span>حالة الاشتراك</span>
                </div>
                <button
                  type="button"
                  onClick={copyMachineCode}
                  title="اضغط لنسخ كود الجهاز"
                  className="text-[10px] text-slate-500 font-mono flex items-center gap-1 hover:text-brand-600 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  <span dir="ltr">كود الجهاز: {licenseStatus?.machineCode ?? "—"}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 p-4 rounded-xl bg-white border border-brand-100 shadow-sm">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">مدة الاشتراك</div>
                  <div className="text-sm font-bold text-slate-900">
                    {subscriptionDurationLabel(form.subscriptionType, form.subscriptionMonths)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">الباقة الحالية</div>
                  <div className="text-sm font-bold text-brand-700">
                    {planDisplayLabel(licenseStatus?.license)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">تاريخ التفعيل</div>
                  <div className="text-sm font-bold text-slate-900">
                    {form.subscriptionStartDate ? new Date(form.subscriptionStartDate).toLocaleDateString("ar-EG") : "غير محدد"}
                  </div>
                </div>
                <div className="col-span-2 pt-3 border-t border-slate-50 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">الوضع الحالي</div>
                    <div className="text-sm font-bold text-emerald-600 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      نشط ومفعل
                    </div>
                  </div>
                  {form.subscriptionType === "limited" && (
                    <div className="text-left">
                      <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">المتبقي</div>
                      <div className="text-sm font-mono font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
                        {Math.max(0, getRemainingDays(form.subscriptionStartDate, form.subscriptionMonths))} يوم
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Warranty Section */}
            <div className="space-y-4 border-r border-slate-100 pr-0 lg:pr-8 lg:border-r">
              <div className="flex items-center gap-2 text-indigo-700 font-bold">
                <Clock className="w-5 h-5" />
                <span>حالة الضمان والصيانة</span>
              </div>

              <div className="grid grid-cols-2 gap-6 p-4 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">مدة الضمان</div>
                  <div className="text-sm font-bold text-slate-900">
                    {form.warrantyType === "none" ? "بدون ضمان" : `${form.warrantyMonths} شهر (صيانة برمجية)`}
                  </div>
                </div>
                {form.warrantyType === "limited" && (
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">تاريخ البدء</div>
                    <div className="text-sm font-bold text-slate-900">
                      {form.warrantyStartDate ? new Date(form.warrantyStartDate).toLocaleDateString("ar-EG") : "غير محدد"}
                    </div>
                  </div>
                )}
                <div className="col-span-2 pt-3 border-t border-slate-50 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">حالة الضمان</div>
                    <div className={`text-sm font-bold ${form.warrantyType === "none" ? "text-slate-400" : "text-indigo-600"}`}>
                      {form.warrantyType === "none" ? "غير مفعل" : "تحت الضمان الساري"}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">الأيام المتبقية</div>
                    <div className={`text-sm font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-2 ${form.warrantyType === "limited" && form.warrantyStartDate ? "text-indigo-600 bg-indigo-50 border-indigo-100" : "text-slate-400 bg-slate-50 border-slate-100"
                      }`}>
                      <Clock className="w-3 h-3" />
                      {!form.warrantyStartDate && form.warrantyType === "limited" ? "تاريخ غير محدد" : (form.warrantyType === "limited" ? Math.max(0, getRemainingDays(form.warrantyStartDate, form.warrantyMonths)) : 0) + " يوم"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardBody>
          <div className="px-6 py-3 bg-brand-50/50 border-t border-brand-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-slate-500">
              * هذه البيانات رسمية وموثقة من قبل <strong>Helpers Technologies</strong> ولا يمكن تعديلها من قبل المستخدم.
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-[10px] h-7 px-3 gap-1"
                onClick={copyMachineCode}
              >
                <Copy className="w-3 h-3" /> نسخ كود الجهاز
              </Button>
              <Button
                size="sm"
                className="text-[10px] h-7 px-3 gap-1"
                onClick={() => setLicenseDialogOpen(true)}
              >
                <KeyRound className="w-3 h-3" /> تجديد / ترقية / تفعيل ضمان
              </Button>
            </div>
          </div>
        </Card>

        <Dialog
          open={licenseDialogOpen}
          onClose={() => setLicenseDialogOpen(false)}
          title="تجديد أو ترقية أو تمديد الترخيص"
          subtitle="جدّد اشتراكك أو فعّل ضمانك أو ارقِ باقتك بدون إعادة تثبيت أو فقدان بياناتك"
          width="lg"
        >
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="text-xs font-bold text-slate-700">خطوة 1 — أرسل كود جهازك للمطوّر</div>
              <Field label="كود الجهاز">
                <div className="flex gap-2">
                  <Input value={licenseStatus?.machineCode ?? "—"} readOnly dir="ltr" className="font-mono text-left" />
                  <Button type="button" variant="outline" onClick={copyMachineCode}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </Field>
              <Button
                type="button"
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={openLicenseRequestWhatsapp}
              >
                <MessageCircle className="w-4 h-4" /> إرسال الطلب عبر واتساب (كود الجهاز مرفق تلقائياً)
              </Button>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ستصلك رسالة بالكود والحالة جاهزة — يكفي إرسالها. سيرسل لك المطوّر سيريالاً جديداً
                يجدّد الاشتراك أو يفعّل الضمان أو يفتح مميزات الباقة الأعلى.
              </p>
            </div>

            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
              <div className="text-xs font-bold text-brand-700">خطوة 2 — الصق السيريال الجديد وفعّله</div>
              <Field label="السيريال الجديد">
                <Textarea
                  rows={3}
                  value={newSerial}
                  onChange={(e) => setNewSerial(e.target.value)}
                  placeholder="HTLIC..."
                  dir="ltr"
                  className="font-mono text-left"
                />
              </Field>
              <Button
                type="button"
                size="lg"
                className="w-full gap-2"
                onClick={applyNewSerial}
                disabled={applyingSerial || !newSerial.trim()}
              >
                <KeyRound className="w-4 h-4" />
                {applyingSerial ? "جارٍ التطبيق..." : "تطبيق السيريال وتحديث الترخيص"}
              </Button>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                يتم التطبيق فوراً على هذا الجهاز دون أي تأثير على بياناتك. يمكنك التجديد في أي وقت —
                حتى قبل انتهاء الاشتراك — فلن يتوقف العمل.
              </p>
            </div>
          </div>
        </Dialog>

        <Card className="lg:col-span-1">
          <CardHeader title="النسخة الاحتياطية" subtitle="حفظ واستعادة كل بيانات النظام" />
          <CardBody className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button onClick={exportBackup} variant="outline" className="w-full justify-start">
                <Download className="w-4 h-4" /> تصدير نسخة احتياطية (Backup)
              </Button>
              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const ok = await importBackup(file);
                      if (ok) toast.success("تم استعادة النسخة الاحتياطية بنجاح");
                      else toast.error("فشل استيراد الملف، تأكد من صحته");
                    }
                  }}
                />
                <Button variant="outline" className="w-full justify-start">
                  <Upload className="w-4 h-4" /> استيراد نسخة احتياطية (Restore)
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              يتم تصدير ملف بصيغة JSON يحتوي على كافة الفواتير، المنتجات، والعملاء.
            </p>
            <div className="pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100"
                onClick={() => {
                  const data = lsGet<unknown | null>("inventory_auto_backup_internal", null);
                  if (data) {
                    const file = new File([JSON.stringify(data)], "internal_backup.json", { type: "application/json" });
                    importBackup(file).then(ok => {
                      if (ok) toast.success("تم استعادة آخر نسخة تلقائية بنجاح");
                    });
                  } else {
                    toast.error("لا توجد نسخة تلقائية مخزنة حالياً");
                  }
                }}
              >
                <Database className="w-3.5 h-3.5" /> استعادة من النسخة التلقائية الداخلية
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader title="تصدير البيانات (Excel)" subtitle="تصدير جداول البيانات إلى ملفات Excel منفصلة" />
          <CardBody className="grid grid-cols-2 gap-2">
            <Button onClick={() => exportToExcel("products")} variant="outline" size="sm" className="justify-start">
              <FileSpreadsheet className="w-4 h-4" /> المنتجات
            </Button>
            <Button onClick={() => exportToExcel("customers")} variant="outline" size="sm" className="justify-start">
              <FileSpreadsheet className="w-4 h-4" /> العملاء
            </Button>
            <Button onClick={() => exportToExcel("suppliers")} variant="outline" size="sm" className="justify-start">
              <FileSpreadsheet className="w-4 h-4" /> الموردين
            </Button>
            <Button onClick={() => exportToExcel("sales")} variant="outline" size="sm" className="justify-start">
              <FileSpreadsheet className="w-4 h-4" /> المبيعات
            </Button>
            <Button onClick={() => exportToExcel("purchases")} variant="outline" size="sm" className="justify-start">
              <FileSpreadsheet className="w-4 h-4" /> المشتريات
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
