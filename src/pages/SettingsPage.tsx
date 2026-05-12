import { useState } from "react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { ConfirmDialog } from "../components/ui/Dialog";
import { RotateCcw, Save, Building2, Printer, Languages } from "lucide-react";

export function SettingsPage() {
  const { settings, updateSettings, resetDemo } = useApp();
  const toast = useToast();
  const [form, setForm] = useState(settings);
  const [resetOpen, setResetOpen] = useState(false);

  function save() {
    updateSettings(form);
    toast.success("تم حفظ الإعدادات");
  }

  return (
    <>
      <PageHeader
        title="الإعدادات"
        description="خيارات الشركة، الطباعة، والعملة"
        actions={
          <>
            <Button variant="outline" onClick={() => setResetOpen(true)}>
              <RotateCcw className="w-4 h-4" /> إعادة تعيين البيانات التجريبية
            </Button>
            <Button onClick={save}>
              <Save className="w-4 h-4" /> حفظ
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="بيانات الشركة" subtitle="تظهر في الفواتير وأعلى التطبيق" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 grid place-items-center text-white font-bold text-lg">
                {form.logoText || "HD"}
              </div>
              <div className="text-xs text-slate-500">
                شعار نصي (حرفين – بديل عن رفع صورة في النسخة التجريبية)
              </div>
            </div>
            <Field label="الشعار النصي (مختصر)">
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
                يتم توليد فاتورة طباعة مستقلة عبر نافذة جديدة تلقائياً عند الضغط على زر "طباعة"
                من صفحة الفاتورة.
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="معلومات"
            subtitle="عن هذه النسخة التجريبية"
          />
          <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <InfoTile icon={<Building2 className="w-5 h-5" />} title="بيانات محلية">
              يتم حفظ كل البيانات في localStorage داخل متصفحك. لا تترك هذه النسخة في بيئة إنتاج.
            </InfoTile>
            <InfoTile icon={<Languages className="w-5 h-5" />} title="دعم اللغة العربية">
              الواجهة بالكامل تدعم الـ RTL وتم اعتماد خط Cairo تلقائياً.
            </InfoTile>
            <InfoTile icon={<Printer className="w-5 h-5" />} title="طباعة احترافية">
              صفحات طباعة مخصصة للبيع والشراء مع توقيع المستلم والمسؤول.
            </InfoTile>
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          resetDemo();
          setForm({ ...form });
          toast.success("تم إعادة التعيين", "تمت استعادة البيانات التجريبية الافتراضية");
        }}
        title="إعادة تعيين البيانات التجريبية"
        message="سيتم حذف أي تعديلات ورجوع كل البيانات إلى الحالة الأولى. متابعة؟"
        confirmText="نعم، أعد التعيين"
        variant="danger"
      />
    </>
  );
}

function InfoTile({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
      <div className="flex items-center gap-2 text-slate-800 font-medium">
        {icon}
        <span>{title}</span>
      </div>
      <div className="text-xs text-slate-600 mt-2">{children}</div>
    </div>
  );
}
