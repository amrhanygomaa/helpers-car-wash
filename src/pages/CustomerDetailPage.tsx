import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Car,
  Receipt,
  Phone,
  MapPin,
  Pencil,
  History,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input } from "../components/ui/Input";
import { PlateNumberInput } from "../components/ui/PlateNumberInput";
import { useCatalog } from "../store/CatalogContext";
import { useCarwash } from "../store/CarwashContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { formatCurrency, formatDate } from "../lib/format";
import { CAR_BRANDS, BRAND_LOGOS } from "../features/vehicles/carBrands";
import { useToast } from "../components/ui/Toast";
import type { Vehicle } from "../types";

export function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { customers } = useCatalog();
  const { vehicles, updateVehicle } = useCarwash();
  const { salesInvoices } = useInvoicing();
  const { settings } = useSettings();

  // Dialog State
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null);
  const [form, setForm] = useState({
    brand: "",
    model: "",
    plateNumber: "",
    color: "",
  });

  const customer = customers.find((c) => c.id === id);

  const viewingInvoices = useMemo(() => {
    if (!id) return [];
    return salesInvoices.filter((inv) => inv.customerId === id);
  }, [salesInvoices, id]);

  const insights = useMemo(() => {
    if (!id) return null;
    const cv = vehicles.filter((v) => v.customerId === id);
    const ci = salesInvoices.filter((inv) => inv.customerId === id && !inv.cancelled);
    const totalSpent = ci.reduce((sum, inv) => sum + inv.total, 0);
    return {
      vehicles: cv,
      totalSpent,
    };
  }, [vehicles, salesInvoices, id]);

  // Brand logo helper
  const getBrandLogo = (brandName: string): string | undefined => {
    if (!brandName) return undefined;
    const q = brandName.trim().toLowerCase();
    const found = CAR_BRANDS.find(
      (b) =>
        b.ar.toLowerCase() === q ||
        b.en.toLowerCase() === q ||
        q.includes(b.ar.toLowerCase()) ||
        q.includes(b.en.toLowerCase())
    );
    if (found && found.logo) {
      return BRAND_LOGOS[found.logo];
    }
    return undefined;
  };

  if (!customer) {
    return (
      <Card>
        <CardBody dir="rtl">
          <div className="text-center py-8">
            <div className="text-slate-900 font-medium">العميل غير موجود</div>
            <Button className="mt-4" onClick={() => navigate("/customers")}>
              العودة للقائمة
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  // Opens vehicle edit modal
  function handleOpenEdit(vehicle: Vehicle) {
    setEditVehicle(vehicle);
    setForm({
      brand: vehicle.brand,
      model: vehicle.model ?? "",
      plateNumber: vehicle.plateNumber,
      color: vehicle.color ?? "",
    });
  }

  // Handles updating vehicle details
  function handleSaveVehicle() {
    if (!editVehicle) return;
    if (!form.brand.trim()) {
      toast.error("ماركة السيارة مطلوبة");
      return;
    }
    updateVehicle(editVehicle.id, form);
    toast.success("تم تحديث بيانات السيارة بنجاح");
    setEditVehicle(null);
  }

  // Filter history invoices for the selected historyVehicle
  const vehicleHistoryInvoices = useMemo(() => {
    if (!historyVehicle) return [];
    return viewingInvoices.filter((inv) => inv.vehicleId === historyVehicle.id);
  }, [viewingInvoices, historyVehicle]);

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title={customer.name}
        description={`كود العميل: ${customer.code ?? "—"}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/customers")}>
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
            <Button
              onClick={() => {
                navigate(`/carwash/new?customerId=${customer.id}`);
              }}
            >
              <Receipt className="h-4 w-4" /> فاتورة غسيل جديدة
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                navigate("/queue");
              }}
            >
              <Car className="h-4 w-4" /> فتح الدور
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<Phone className="h-5 w-5" />}
          label="الهاتف"
          value={customer.phone ?? "—"}
          tone="blue"
        />
        <StatCard
          icon={<MapPin className="h-5 w-5" />}
          label="المنطقة / العنوان"
          value={customer.address ?? "—"}
          tone="slate"
        />
        <StatCard
          icon={<Receipt className="h-5 w-5" />}
          label="إجمالي التعامل"
          value={formatCurrency(insights?.totalSpent ?? 0, settings.currency)}
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cars list */}
        <Card className="lg:col-span-1">
          <CardHeader title="سيارات العميل" />
          <CardBody>
            {insights?.vehicles.length ? (
              <div className="space-y-3">
                {insights.vehicles.map((vehicle) => {
                  const logo = getBrandLogo(vehicle.brand);
                  return (
                    <div
                      key={vehicle.id}
                      className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-white border border-slate-100 grid place-items-center p-1.5 flex-shrink-0">
                          {logo ? (
                            <img
                              src={logo}
                              alt={vehicle.brand}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Car className="h-6 w-6 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 text-base">
                            {vehicle.brand} {vehicle.model}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {vehicle.color && <span>اللون: {vehicle.color}</span>}
                          </div>
                          <div className="mt-2 inline-block bg-slate-100 border border-slate-200 rounded px-2 py-0.5 font-mono text-xs font-bold text-slate-700 tracking-wider">
                            {vehicle.plateNumber}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="سجل الغسلات"
                          className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          onClick={() => setHistoryVehicle(vehicle)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="تعديل"
                          className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          onClick={() => handleOpenEdit(vehicle)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<Car className="h-5 w-5" />} title="لا توجد سيارات مسجلة" />
            )}
          </CardBody>
        </Card>

        {/* Invoices list */}
        <Card className="lg:col-span-2">
          <CardHeader title="سجل فواتير الغسيل" />
          <CardBody className="p-0">
            {viewingInvoices.length === 0 ? (
              <div className="p-6">
                <EmptyState title="لا توجد فواتير" />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>رقم الفاتورة</TH>
                    <TH>التاريخ</TH>
                    <TH className="text-end">الإجمالي</TH>
                    <TH>الحالة</TH>
                    <TH className="text-end">إجراءات</TH>
                  </TR>
                </THead>
                <TBody>
                  {viewingInvoices.map((inv) => (
                    <TR key={inv.id}>
                      <TD className="font-mono text-xs text-brand-700 font-semibold">
                        <Link to={`/sales/${inv.id}`} className="hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      </TD>
                      <TD>{formatDate(inv.date)}</TD>
                      <TD className="text-end font-medium">
                        {formatCurrency(inv.total, settings.currency)}
                      </TD>
                      <TD>
                        {inv.cancelled ? (
                          <Badge tone="slate">ملغاة</Badge>
                        ) : (
                          <Badge tone="green">مسددة</Badge>
                        )}
                      </TD>
                      <TD className="text-end">
                        <Link
                          to={`/sales/${inv.id}`}
                          className="text-xs text-brand-700 hover:underline font-medium"
                        >
                          عرض التفاصيل
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Edit Vehicle Dialog */}
      <Dialog
        open={!!editVehicle}
        onClose={() => setEditVehicle(null)}
        title="تعديل بيانات المركبة"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditVehicle(null)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveVehicle}>حفظ التغييرات</Button>
          </>
        }
      >
        <div className="space-y-4 text-start" dir="rtl">
          <Field label="ماركة السيارة" required>
            <Input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              placeholder="مثال: تويوتا، هيونداي..."
            />
          </Field>
          <Field label="الموديل / السنة">
            <Input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="مثال: كورولا، 2022..."
            />
          </Field>
          <Field label="رقم اللوحة">
            <PlateNumberInput
              value={form.plateNumber}
              onPlateChange={(val) => setForm((prev) => ({ ...prev, plateNumber: val }))}
            />
          </Field>
          <Field label="اللون">
            <Input
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              placeholder="مثال: فضي، أسود..."
            />
          </Field>
        </div>
      </Dialog>

      {/* Vehicle Wash History Dialog */}
      <Dialog
        open={!!historyVehicle}
        onClose={() => setHistoryVehicle(null)}
        title={`سجل غسيل السيارة - ${historyVehicle?.brand} ${historyVehicle?.model}`}
        width="lg"
      >
        <div dir="rtl" className="text-start space-y-4">
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-4">
            <div className="w-12 h-12 rounded-lg bg-white border border-slate-100 grid place-items-center p-1.5">
              {historyVehicle && getBrandLogo(historyVehicle.brand) ? (
                <img
                  src={getBrandLogo(historyVehicle.brand)}
                  alt={historyVehicle.brand}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Car className="h-6 w-6 text-slate-400" />
              )}
            </div>
            <div>
              <div className="font-bold text-slate-900 text-lg">
                {historyVehicle?.brand} {historyVehicle?.model}
              </div>
              <div className="mt-1 inline-block bg-slate-100 border border-slate-200 rounded px-2 py-0.5 font-mono text-xs font-bold text-slate-700 tracking-wider">
                {historyVehicle?.plateNumber}
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {vehicleHistoryInvoices.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                لا توجد فواتير غسيل مسجلة لهذه السيارة.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>رقم الفاتورة</TH>
                    <TH>التاريخ</TH>
                    <TH>الخدمات المقدمة</TH>
                    <TH className="text-end">الإجمالي</TH>
                  </TR>
                </THead>
                <TBody>
                  {vehicleHistoryInvoices.map((inv) => (
                    <TR key={inv.id}>
                      <TD className="font-mono text-xs text-brand-700 font-semibold">
                        <Link to={`/sales/${inv.id}`} className="hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      </TD>
                      <TD>{formatDate(inv.date)}</TD>
                      <TD className="text-slate-600">
                        {inv.lines.map((l) => l.productName).join(" + ")}
                      </TD>
                      <TD className="text-end font-semibold text-slate-900">
                        {formatCurrency(inv.total, settings.currency)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setHistoryVehicle(null)}>
              إغلاق
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "slate";
}) {
  const tones: Record<typeof tone, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className={`grid h-12 w-12 place-items-center rounded-xl ${tones[tone]} border`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500 font-medium">{label}</div>
        <div className="text-base font-semibold text-slate-900 mt-1">{value}</div>
      </div>
    </div>
  );
}
