import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Filter, Plus, ShoppingBag, Search, Printer } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Select } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { inRange } from "../lib/utils";
import { printAppRoute } from "../lib/print";

export function PurchaseInvoicesPage() {
  const { purchaseInvoices, suppliers, settings } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    let list = purchaseInvoices;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.invoiceNumber.toLowerCase().includes(t) ||
          s.supplierName.toLowerCase().includes(t)
      );
    }
    if (supplierId) list = list.filter((s) => s.supplierId === supplierId);
    if (status) list = list.filter((s) => s.status === status);
    list = list.filter((s) => inRange(s.date, from, to));
    return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [purchaseInvoices, q, supplierId, status, from, to]);

  const totals = useMemo(() => {
    const total = filtered.reduce((a, s) => a + s.total, 0);
    const paid = filtered.reduce((a, s) => a + s.amountPaid, 0);
    const remaining = filtered.reduce((a, s) => a + s.remaining, 0);
    return { total, paid, remaining };
  }, [filtered]);

  return (
    <>
      <PageHeader
        title="فواتير المشتريات"
        description={`إدارة فواتير الموردين (${purchaseInvoices.length})`}
        actions={
          <Button onClick={() => navigate("/purchases/new")}>
            <Plus className="w-4 h-4" />
            فاتورة جديدة
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="إجمالي المشتريات" value={formatCurrency(totals.total, settings.currency)} tone="blue" />
        <Stat label="المدفوع" value={formatCurrency(totals.paid, settings.currency)} tone="green" />
        <Stat label="المتبقي للموردين" value={formatCurrency(totals.remaining, settings.currency)} tone="amber" />
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
                placeholder="بحث برقم الفاتورة أو المورد..."
                className="pe-9"
              />
            </div>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-52">
              <option value="">كل الموردين</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
              <option value="">كل الحالات</option>
              <option value="paid">مسدد</option>
              <option value="partial">جزئي</option>
              <option value="unpaid">غير مسدد</option>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQ("");
                setSupplierId("");
                setStatus("");
                setFrom("");
                setTo("");
              }}
            >
              مسح الفلاتر
            </Button>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="w-5 h-5" />}
              title="لا توجد فواتير"
              description="لم تُنشَأ أي فاتورة مشتريات بعد."
              action={
                <Button onClick={() => navigate("/purchases/new")}>
                  <Plus className="w-4 h-4" /> إنشاء فاتورة
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الرقم</TH>
                  <TH>التاريخ</TH>
                  <TH>المورد</TH>
                  <TH className="text-end">الإجمالي</TH>
                  <TH className="text-end">المدفوع</TH>
                  <TH className="text-end">المتبقي</TH>
                  <TH>الحالة</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-mono text-xs">
                      <Link to={`/purchases/${s.id}`} className="text-brand-700 hover:underline">
                        {s.invoiceNumber}
                      </Link>
                    </TD>
                    <TD>{formatDate(s.date)}</TD>
                    <TD className="font-medium text-slate-900">{s.supplierName}</TD>
                    <TD className="text-end">{formatCurrency(s.total, settings.currency)}</TD>
                    <TD className="text-end text-emerald-700">
                      {formatCurrency(s.amountPaid, settings.currency)}
                    </TD>
                    <TD className="text-end">
                      {s.remaining > 0 ? (
                        <span className="text-rose-700">
                          {formatCurrency(s.remaining, settings.currency)}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </TD>
                    <TD>
                      {s.status === "paid" ? (
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
                          onClick={() => navigate(`/purchases/${s.id}`)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="طباعة"
                          onClick={async () => {
                            const result = await printAppRoute(`/purchases/${s.id}/print`);
                            if (!result.ok && result.error !== "cancelled") {
                              toast.error("تعذر الطباعة", "تأكد من إعدادات الطابعة وحاول مرة أخرى");
                            }
                          }}
                        >
                          <Printer className="w-4 h-4" />
                        </Button>
                      </div>
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
        <ShoppingBag className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-semibold text-slate-900 text-lg">{value}</div>
      </div>
    </div>
  );
}
