import { useEffect, useState } from "react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { lsGet } from "../lib/storage";
import { Save, Printer, Download, Upload, Database, FileSpreadsheet, ShieldCheck, Clock, Image as ImageIcon, Trash2, FolderOpen } from "lucide-react";

export function SettingsPage() {
  const { settings, updateSettings, exportBackup, importBackup, backupToPath, exportToExcel } = useApp();
  const toast = useToast();
  const [form, setForm] = useState(settings);

  useEffect(() => setForm(settings), [settings]);

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
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center text-white font-bold text-2xl">
                  {form.logoImage ? (
                    <img src={form.logoImage} alt="Logo" className="w-full h-full object-cover" />
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
            <Field label="الرصيد الافتتاحي للخزينة">
              <Input
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(e) =>
                  setForm({ ...form, openingBalance: Number(e.target.value) })
                }
              />
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
                <div className="text-[10px] text-slate-400 font-mono">ID: {settings.companyName.slice(0, 3)}-{new Date(form.subscriptionStartDate).getTime().toString().slice(-4)}</div>
              </div>

              <div className="grid grid-cols-2 gap-6 p-4 rounded-xl bg-white border border-brand-100 shadow-sm">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">نوع الاشتراك</div>
                  <div className="text-sm font-bold text-slate-900">
                    {form.subscriptionType === "lifetime" ? "مدى الحياة (احترافي)" : "فترة محدودة"}
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
          <div className="px-6 py-3 bg-brand-50/50 border-t border-brand-100 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              * هذه البيانات رسمية وموثقة من قبل <strong>Helpers Technologies</strong> ولا يمكن تعديلها من قبل المستخدم.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px] h-7 px-3"
              onClick={() => window.open("https://wa.me/201118445625", "_blank")}
            >
              طلب تمديد أو دعم
            </Button>
          </div>
        </Card>

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
