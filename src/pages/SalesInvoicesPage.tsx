import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Filter, Receipt, Search, Printer, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Select } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { Dialog, ConfirmDialog } from "../components/ui/Dialog";
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
  const { salesInvoices, salesReturns, deleteSalesInvoice } = useInvoicing();
  const { customers } = useCatalog();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const canDeleteSales = hasPermission(currentUser, "salesInvoices", "delete");
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [toDelete, setToDelete] = useState<SalesInvoice | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);

  const customerCodeMap = useMemo(
    () => new Map(customers.map((c) => [c.id, (c.code ?? "").toLowerCase()])),
    [customers]
  );

  const customerPhoneMap = useMemo(
    () => new Map(customers.map((c) => [c.id, (c.phone ?? "").toLowerCase()])),
    [customers]
  );

  const returnedInvoiceIds = useMemo(
    () => new Set(salesReturns.map((r) => r.originalInvoiceId)),
    [salesReturns]
  );

  const filtered = useMemo(() => {
    let list = salesInvoices;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.invoiceNumber.toLowerCase().includes(t) ||
          s.customerName.toLowerCase().includes(t) ||
          (customerCodeMap.get(s.customerId) ?? "").includes(t) ||
          (customerPhoneMap.get(s.customerId) ?? "").includes(t)
      );
    }
    if (customerId) list = list.filter((s) => s.customerId === customerId);
    list = list.filter((s) => inRange(s.date, from, to));
    return [...list].sort((a, b) => {
      if (a.date !== b.date) {
        return a.date < b.date ? 1 : -1;
      }
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1;
      }
      return b.invoiceNumber.localeCompare(a.invoiceNumber, undefined, { numeric: true });
    });
  }, [salesInvoices, customerCodeMap, customerPhoneMap, q, customerId, from, to]);

  const totals = useMemo(() => {
    const total = filtered.reduce((a, s) => a + (s.cancelled ? 0 : s.total), 0);
    const count = filtered.filter((s) => !s.cancelled).length;
    return { total, count };
  }, [filtered]);

  return (
    <>
      <PageHeader
        title="الفواتير"
        description={`متابعة الفواتير والتحصيل (${salesInvoices.length})`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Stat label="إجمالي الفواتير" value={formatCurrency(totals.total, settings.currency)} tone="blue" />
        <Stat label="عدد الفواتير" value={String(totals.count)} tone="green" />
      </div>

      <Card>
        <CardHeader
          title="قائمة الفواتير"
          actions={
            selectedIds.length > 0 ? (
              <Button
                variant="danger"
                size="sm"
                className="flex items-center gap-1.5 font-bold"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4" />
                حذف المحددة ({selectedIds.length})
              </Button>
            ) : (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Filter className="w-3.5 h-3.5" />
                فلاتر سريعة
              </div>
            )
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end justify-between w-full">
            <div className="flex flex-wrap gap-2 items-end">
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
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-slate-500">من تاريخ</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-slate-500">إلى تاريخ</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQ("");
                  setCustomerId("");
                  setFrom("");
                  setTo("");
                }}
              >
                مسح الفلاتر
              </Button>
            </div>
            {canDeleteSales && (
              <Button
                variant={selectionMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectionMode((prev) => {
                    const next = !prev;
                    if (!next) setSelectedIds([]);
                    return next;
                  });
                }}
                className={selectionMode ? "bg-slate-200 border-slate-300 text-slate-700 font-bold" : ""}
              >
                {selectionMode ? "إلغاء التحديد" : "تحديد"}
              </Button>
            )}
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-5 h-5" />}
              title="لا توجد فواتير"
              description="لم تُنشَأ أي فاتورة غسيل بعد."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  {canDeleteSales && selectionMode && (
                    <TH className="w-10">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selectedIds.length === filtered.length}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = selectedIds.length > 0 && selectedIds.length < filtered.length;
                          }
                        }}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(filtered.map((s) => s.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                        aria-label="تحديد الكل"
                      />
                    </TH>
                  )}
                  <TH>الرقم</TH>
                  <TH>التاريخ</TH>
                  <TH>العميل</TH>
                  <TH className="text-end">الإجمالي</TH>
                  <TH>الحالة</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => (
                  <TR key={s.id}>
                    {canDeleteSales && selectionMode && (
                      <TD>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => [...prev, s.id]);
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== s.id));
                            }
                          }}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                          aria-label={`تحديد الفاتورة ${s.invoiceNumber}`}
                        />
                      </TD>
                    )}
                    <TD className="font-mono text-xs">
                      <Link to={`/sales/${s.id}`} className="text-brand-700 hover:underline">
                        {s.invoiceNumber}
                      </Link>
                    </TD>
                    <TD>{formatDate(s.date)}</TD>
                    <TD className="font-medium text-slate-900">{s.customerName}</TD>
                    <TD className="text-end">{formatCurrency(s.total, settings.currency)}</TD>
                    <TD>
                      {s.cancelled ? (
                        <Badge tone="slate">ملغاة</Badge>
                      ) : returnedInvoiceIds.has(s.id) ? (
                        <Badge tone="amber">بها مرتجع</Badge>
                      ) : (
                        <Badge tone="green">مكتملة</Badge>
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
          if (ok) {
            toast.success("تم حذف الفاتورة");
            setSelectedIds((prev) => prev.filter((id) => id !== toDelete.id));
          } else {
            toast.error("تعذر الحذف", "الفواتير المرتبطة بمرتجعات لا يمكن حذفها");
          }
          setToDelete(null);
        }}
        title="حذف الفاتورة"
        message={`هل أنت متأكد من حذف الفاتورة ${toDelete?.invoiceNumber ?? ""}؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmText="حذف"
        variant="danger"
      />

      <Dialog
        open={bulkDeleteOpen}
        onClose={() => {
          setBulkDeleteOpen(false);
          setConfirmWord("");
        }}
        title="تأكيد حذف الفواتير المحددة دفعة واحدة"
        width="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setBulkDeleteOpen(false);
                setConfirmWord("");
              }}
            >
              إلغاء
            </Button>
            <Button
              variant="danger"
              disabled={confirmWord !== "احذف"}
              onClick={() => {
                let deletedCount = 0;
                let failCount = 0;
                selectedIds.forEach((id) => {
                  const ok = deleteSalesInvoice(id);
                  if (ok) deletedCount++;
                  else failCount++;
                });

                if (deletedCount > 0) {
                  toast.success(`تم حذف ${deletedCount} فواتير بنجاح`);
                }
                if (failCount > 0) {
                  toast.error(`تعذر حذف ${failCount} فواتير`, "الفواتير المرتبطة بمرتجعات لا يمكن حذفها");
                }

                setSelectedIds([]);
                setSelectionMode(false);
                setBulkDeleteOpen(false);
                setConfirmWord("");
              }}
            >
              حذف الفواتير المحددة
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-right" dir="rtl">
          <div className="text-sm text-slate-700 leading-relaxed">
            لقد حددت <strong className="text-rose-600">{selectedIds.length}</strong> فواتير للحذف النهائي.
            <br />
            سيتم إرجاع البضائع للمخزن وعكس القيود المالية من الخزينة تلقائياً. <strong>لا يمكن التراجع عن هذا الإجراء!</strong>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">
              لتأكيد الحذف النهائي، اكتب كلمة <span className="text-rose-600 font-bold select-all bg-rose-50 px-1 py-0.5 rounded border border-rose-100">احذف</span> أدناه:
            </label>
            <Input
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value)}
              placeholder="اكتب كلمة احذف هنا..."
              className="w-full text-center font-bold"
            />
          </div>
        </div>
      </Dialog>
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
