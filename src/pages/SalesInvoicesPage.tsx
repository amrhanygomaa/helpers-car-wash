import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Filter, Plus, Receipt, Search, Printer, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Select } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { ConfirmDialog } from "../components/ui/Dialog";
import { useInvoicing } from "../store/InvoicingContext";
import { useCatalog } from "../store/CatalogContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { inRange } from "../lib/utils";
import { printAppRoute } from "../lib/print";
import { hasPermission } from "../lib/permissions";
import type { SalesInvoice } from "../types";

export function SalesInvoicesPage() {
  const { salesInvoices, deleteSalesInvoice } = useInvoicing();
  const { customers } = useCatalog();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const canAddSalesInvoice = hasPermission(currentUser, "salesInvoices", "add");
  const canDeleteSales = hasPermission(currentUser, "salesInvoices", "delete");
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [toDelete, setToDelete] = useState<SalesInvoice | null>(null);

  const customerCodeMap = useMemo(
    () => new Map(customers.map((c) => [c.id, (c.code ?? "").toLowerCase()])),
    [customers]
  );

  const customerPhoneMap = useMemo(
    () => new Map(customers.map((c) => [c.id, (c.phone ?? "").toLowerCase()])),
    [customers]
  );

  const filtered = useMemo(() => {
    let list = salesInvoices;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.invoiceNumber.toLowerCase().includes(t) ||
          s.customerName.toLowerCase().includes(t) ||
          (s.driverName ?? "").toLowerCase().includes(t) ||
          (customerCodeMap.get(s.customerId) ?? "").includes(t) ||
          (customerPhoneMap.get(s.customerId) ?? "").includes(t)
      );
    }
    if (customerId) list = list.filter((s) => s.customerId === customerId);
    if (status === "overpaid") list = list.filter((s) => s.status === "paid" && (s.overpayment ?? 0) > 0);
    else if (status) list = list.filter((s) => s.status === status);
    if (payment) list = list.filter((s) => s.paymentType === payment);
    list = list.filter((s) => inRange(s.date, from, to));
    return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [salesInvoices, customerCodeMap, customerPhoneMap, q, customerId, status, payment, from, to]);

  const totals = useMemo(() => {
    const total = filtered.reduce((a, s) => a + (s.cancelled ? 0 : s.total), 0);
    const received = filtered.reduce(
      (a, s) => a + (s.cancelled ? 0 : s.amountReceived),
      0
    );
    const remaining = filtered.reduce(
      (a, s) => a + (s.cancelled ? 0 : s.remaining),
      0
    );
    return { total, received, remaining };
  }, [filtered]);

  return (
    <>
      <PageHeader
        title="فواتير المبيعات"
        description={`إدارة فواتير العملاء (${salesInvoices.length})`}
        actions={
          canAddSalesInvoice ? (
            <Button onClick={() => navigate("/sales/new")}>
              <Plus className="w-4 h-4" />
              فاتورة جديدة
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="إجمالي الفواتير" value={formatCurrency(totals.total, settings.currency)} tone="blue" />
        <Stat label="المحصل" value={formatCurrency(totals.received, settings.currency)} tone="green" />
        <Stat label="المتبقي" value={formatCurrency(totals.remaining, settings.currency)} tone="amber" />
      </div>

      <Card>
        <CardHeader
          title="قائمة الفواتير"
          actions={
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5" />
              فلاتر سريعة
            </div>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 end-3 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث برقم الفاتورة أو العميل..."
                className="pe-9"
              />
            </div>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-52">
              <option value="">كل العملاء</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="">كل الحالات</option>
              <option value="paid">مسدد</option>
              <option value="overpaid">مسدد بزيادة</option>
              <option value="partial">جزئي</option>
              <option value="unpaid">غير مسدد</option>
            </Select>
            <Select value={payment} onChange={(e) => setPayment(e.target.value)} className="w-32">
              <option value="">كل الأنواع</option>
              <option value="cash">نقدي</option>
              <option value="account">آجل</option>
            </Select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 whitespace-nowrap">من:</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 whitespace-nowrap">إلى:</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQ("");
                setCustomerId("");
                setStatus("");
                setPayment("");
                setFrom("");
                setTo("");
              }}
            >
              مسح الفلاتر
            </Button>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-5 h-5" />}
              title="لا توجد فواتير"
              description="لم تُنشَأ أي فاتورة مبيعات بعد."
              action={
                canAddSalesInvoice ? (
                  <Button onClick={() => navigate("/sales/new")}>
                    <Plus className="w-4 h-4" /> إنشاء فاتورة
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الرقم</TH>
                  <TH>التاريخ</TH>
                  <TH>العميل</TH>
                  <TH>السائق</TH>
                  <TH className="text-end">الإجمالي</TH>
                  <TH className="text-end">المستلم</TH>
                  <TH className="text-end">المتبقي</TH>
                  <TH>الدفع</TH>
                  <TH>الحالة</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-mono text-xs">
                      <Link to={`/sales/${s.id}`} className="text-brand-700 hover:underline">
                        {s.invoiceNumber}
                      </Link>
                    </TD>
                    <TD>{formatDate(s.date)}</TD>
                    <TD className="font-medium text-slate-900">{s.customerName}</TD>
                    <TD className="text-slate-600 text-xs">{s.driverName ?? "—"}</TD>
                    <TD className="text-end">{formatCurrency(s.total, settings.currency)}</TD>
                    <TD className="text-end text-emerald-700">
                      {formatCurrency(s.amountReceived, settings.currency)}
                    </TD>
                    <TD className="text-end">
                      {s.overpayment && s.overpayment > 0 ? (
                        <span className="text-emerald-700">
                          رصيد دائن {formatCurrency(s.overpayment, settings.currency)}
                        </span>
                      ) : s.remaining > 0 ? (
                        <span className="text-rose-700">
                          {formatCurrency(s.remaining, settings.currency)}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={s.paymentType === "cash" ? "emerald" : "indigo"}>
                        {s.paymentType === "cash" ? "نقدي" : "آجل"}
                      </Badge>
                    </TD>
                    <TD>
                      {s.cancelled ? (
                        <Badge tone="slate">ملغاة</Badge>
                      ) : s.status === "paid" && (s.overpayment ?? 0) > 0 ? (
                        <Badge tone="blue">مسدد بزيادة</Badge>
                      ) : s.status === "paid" ? (
                        <Badge tone="green">مسدد</Badge>
                      ) : s.status === "partial" ? (
                        <Badge tone="amber">جزئي</Badge>
                      ) : (
                        <Badge tone="red">غير مسدد</Badge>
                      )}
                    </TD>
                    <TD className="text-end">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="عرض"
                          onClick={() => navigate(`/sales/${s.id}`)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="طباعة"
                          onClick={async () => {
                            const result = await printAppRoute(`/sales/${s.id}/print`);
                            if (!result.ok && result.error !== "cancelled") {
                              toast.error("تعذر الطباعة", "تأكد من إعدادات الطابعة وحاول مرة أخرى");
                            }
                          }}
                        >
                          <Printer className="w-4 h-4" />
                        </Button>
                        {canDeleteSales && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="حذف"
                            className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => setToDelete(s)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return;
          const ok = deleteSalesInvoice(toDelete.id);
          if (ok) toast.success("تم حذف الفاتورة");
          else toast.error("تعذر الحذف", "الفواتير المرتبطة بمرتجعات لا يمكن حذفها");
          setToDelete(null);
        }}
        title="حذف فاتورة المبيعات"
        message={`هل أنت متأكد من حذف الفاتورة ${toDelete?.invoiceNumber ?? ""}؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmText="حذف"
        variant="danger"
      />
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "amber";
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg grid place-items-center ${colors[tone]}`}>
        <Receipt className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-semibold text-slate-900 text-lg">{value}</div>
      </div>
    </div>
  );
}
