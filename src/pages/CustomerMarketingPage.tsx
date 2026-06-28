import { useMemo, useState } from "react";
import { Copy, Download, MessageCircle, Search, Send, Users } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { useCarwash } from "../store/CarwashContext";
import { useCatalog } from "../store/CatalogContext";
import { useSettings } from "../store/SettingsContext";
import type { Customer, Vehicle } from "../types";

type MarketingRow = {
  customer: Customer;
  phone: string;
  vehicles: Vehicle[];
  brands: string[];
  message: string;
};

const DEFAULT_TEMPLATE =
  "أهلاً {{name}}، معاك {{company}}. عندنا عروض غسيل مميزة لعربيتك{{brands}}. مستنيينك تنورنا.";

function cleanPhone(phone?: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `20${digits.slice(1)}`;
  return digits;
}

function renderTemplate(template: string, customer: Customer, brands: string[], company: string): string {
  const brandText = brands.length > 0 ? ` (${brands.join("، ")})` : "";
  return template
    .replaceAll("{{name}}", customer.name)
    .replaceAll("{{phone}}", customer.phone ?? "")
    .replaceAll("{{company}}", company)
    .replaceAll("{{brands}}", brandText);
}

function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CustomerMarketingPage() {
  const { customers } = useCatalog();
  const { vehicles } = useCarwash();
  const { settings } = useSettings();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);

  const activeCustomers = useMemo(() => customers.filter((customer) => !customer.archived), [customers]);

  const vehiclesByCustomer = useMemo(() => {
    const map = new Map<string, Vehicle[]>();
    for (const vehicle of vehicles) {
      if (vehicle.archived) continue;
      const list = map.get(vehicle.customerId) ?? [];
      list.push(vehicle);
      map.set(vehicle.customerId, list);
    }
    return map;
  }, [vehicles]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const vehicle of vehicles) {
      const value = vehicle.brand.trim();
      if (!vehicle.archived && value) set.add(value);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const rows = useMemo<MarketingRow[]>(() => {
    const company = settings.companyNameAr || settings.companyName || "Top Gear";
    const term = query.trim().toLowerCase();
    return activeCustomers
      .map((customer) => {
        const customerVehicles = vehiclesByCustomer.get(customer.id) ?? [];
        const brands = [...new Set(customerVehicles.map((vehicle) => vehicle.brand.trim()).filter(Boolean))];
        return {
          customer,
          phone: cleanPhone(customer.phone),
          vehicles: customerVehicles,
          brands,
          message: renderTemplate(template, customer, brands, company),
        };
      })
      .filter((row) => row.phone)
      .filter((row) => !brand || row.brands.includes(brand))
      .filter((row) => {
        if (!term) return true;
        const hay = `${row.customer.name} ${row.customer.phone ?? ""} ${row.brands.join(" ")} ${row.vehicles
          .map((vehicle) => `${vehicle.model ?? ""} ${vehicle.plateNumber}`)
          .join(" ")}`.toLowerCase();
        return hay.includes(term);
      });
  }, [activeCustomers, vehiclesByCustomer, settings.companyNameAr, settings.companyName, query, brand, template]);

  const customersWithoutPhone = activeCustomers.filter((customer) => !cleanPhone(customer.phone)).length;
  const totalVehicles = rows.reduce((sum, row) => sum + row.vehicles.length, 0);

  async function copyPhones() {
    if (rows.length === 0) return;
    await navigator.clipboard.writeText(rows.map((row) => row.phone).join("\n"));
    toast.success("تم نسخ الأرقام", `${rows.length} رقم جاهز للاستخدام`);
  }

  async function copyMessages() {
    if (rows.length === 0) return;
    const text = rows.map((row) => `${row.customer.name} - ${row.phone}\n${row.message}`).join("\n\n");
    await navigator.clipboard.writeText(text);
    toast.success("تم نسخ الرسائل", "تم نسخ الرسائل الشخصية للعملاء المحددين");
  }

  function exportRows() {
    downloadCsv("customer-marketing.csv", [
      ["العميل", "الهاتف", "الماركات", "عدد المركبات", "الرسالة"],
      ...rows.map((row) => [
        row.customer.name,
        row.phone,
        row.brands.join(" / "),
        String(row.vehicles.length),
        row.message,
      ]),
    ]);
  }

  function openWhatsapp(row: MarketingRow) {
    window.open(whatsappUrl(row.phone, row.message), "_blank", "noopener,noreferrer");
  }

  function openFirstTen() {
    rows.slice(0, 10).forEach((row) => window.open(whatsappUrl(row.phone, row.message), "_blank", "noopener,noreferrer"));
    toast.info("تم فتح أول 10 روابط", "قد يمنع المتصفح بعض النوافذ حسب إعداداته");
  }

  return (
    <>
      <PageHeader
        title="تسويق العملاء"
        description="تقسيم العملاء حسب ماركة المركبة وتجهيز رسائل واتساب أو ملف CSV للتواصل."
        actions={
          <>
            <Button variant="outline" onClick={copyPhones} disabled={rows.length === 0}>
              <Copy className="h-4 w-4" /> نسخ الأرقام
            </Button>
            <Button variant="outline" onClick={exportRows} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button onClick={openFirstTen} disabled={rows.length === 0}>
              <Send className="h-4 w-4" /> فتح أول 10
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="عملاء قابلون للتواصل" value={String(rows.length)} />
        <Stat label="مركبات داخل الفلتر" value={String(totalVehicles)} />
        <Stat label="عملاء بدون رقم" value={String(customersWithoutPhone)} tone="amber" />
      </div>

      <Card className="mb-4">
        <CardBody className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_260px_1fr]">
          <Field label="بحث">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="ps-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم، رقم، ماركة، لوحة..." />
            </div>
          </Field>
          <Field label="ماركة المركبة">
            <Select title="ماركة المركبة" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">كل الماركات</option>
              {brandOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="قالب الرسالة" hint="المتغيرات المتاحة: {{name}}، {{phone}}، {{company}}، {{brands}}">
            <Textarea rows={3} value={template} onChange={(e) => setTemplate(e.target.value)} />
          </Field>
          <div className="xl:col-span-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setTemplate(DEFAULT_TEMPLATE)}>
              استعادة القالب الافتراضي
            </Button>
            <Button variant="outline" onClick={copyMessages} disabled={rows.length === 0}>
              <Copy className="h-4 w-4" /> نسخ الرسائل
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="قائمة التواصل" subtitle="كل صف يحتوي رابط واتساب برسالة مخصصة للعميل." />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="لا توجد نتائج"
                description="غيّر الفلتر أو أضف أرقام هواتف ومركبات للعملاء."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>العميل</TH>
                  <TH>الهاتف</TH>
                  <TH>الماركات</TH>
                  <TH className="text-end">مركبات</TH>
                  <TH>معاينة الرسالة</TH>
                  <TH className="w-24"></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.customer.id}>
                    <TD className="font-medium text-slate-900">{row.customer.name}</TD>
                    <TD dir="ltr" className="font-mono text-xs">{row.phone}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {row.brands.length > 0 ? (
                          row.brands.map((value) => <Badge key={value} tone="blue">{value}</Badge>)
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </TD>
                    <TD className="text-end">{row.vehicles.length}</TD>
                    <TD className="max-w-md text-xs text-slate-600">{row.message}</TD>
                    <TD>
                      <Button size="sm" variant="outline" onClick={() => openWhatsapp(row)}>
                        <MessageCircle className="h-3.5 w-3.5" /> واتساب
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Stat({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string;
  tone?: "blue" | "amber";
}) {
  const classes = tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`rounded-lg px-3 py-1 text-lg font-bold ${classes}`}>{value}</div>
    </div>
  );
}
