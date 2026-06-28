import { useMemo, useState } from "react";
import { Car, History, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useCarwash } from "../store/CarwashContext";
import { useCatalog } from "../store/CatalogContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { visitHistory } from "../store/_pure";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCurrency, formatDate } from "../lib/format";
import type { Vehicle } from "../types";
import { hasPermission } from "../lib/permissions";

/** "Toyota Corolla · ABC-123" — shared label used across queue/invoices. */
export function vehicleLabel(v: Pick<Vehicle, "brand" | "model" | "plateNumber">): string {
  const make = [v.brand, v.model].filter(Boolean).join(" ").trim();
  return make ? `${make} · ${v.plateNumber}` : v.plateNumber;
}

export function VehiclesPage() {
  const { vehicles, addVehicle, updateVehicle, deleteVehicle } = useCarwash();
  const { customers } = useCatalog();
  const { salesInvoices } = useInvoicing();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const canAdd = hasPermission(currentUser, "vehicles", "add");
  const canEdit = hasPermission(currentUser, "vehicles", "edit");
  const canDelete = hasPermission(currentUser, "vehicles", "delete");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null);
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");

  const historyInvoices = useMemo(
    () =>
      historyVehicle
        ? salesInvoices
            .filter((inv) => inv.vehicleId === historyVehicle.id && !inv.cancelled)
            .sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [historyVehicle, salesInvoices]
  );
  const historyStats = useMemo(() => visitHistory(historyInvoices), [historyInvoices]);

  const customerName = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const washCount = useMemo(() => {
    const map = new Map<string, number>();
    salesInvoices.forEach((inv) => {
      if (inv.vehicleId && !inv.cancelled) {
        map.set(inv.vehicleId, (map.get(inv.vehicleId) ?? 0) + 1);
      }
    });
    return map;
  }, [salesInvoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (v.archived) return false;
      if (customerFilter && v.customerId !== customerFilter) return false;
      if (!q) return true;
      const hay = `${v.brand} ${v.model ?? ""} ${v.plateNumber} ${v.color ?? ""} ${customerName.get(v.customerId) ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [vehicles, search, customerFilter, customerName]);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const customerId = fd.get("customerId") as string;
    const plateNumber = (fd.get("plateNumber") as string).trim();
    const brand = (fd.get("brand") as string).trim();
    if (!customerId) {
      toast.error("اختر العميل");
      return;
    }
    if (!plateNumber) {
      toast.error("أدخل رقم اللوحة");
      return;
    }
    const data = {
      customerId,
      brand,
      model: (fd.get("model") as string).trim(),
      plateNumber,
      color: (fd.get("color") as string).trim(),
      notes: (fd.get("notes") as string).trim(),
    };
    if (editing) {
      updateVehicle(editing.id, data);
      toast.success("تم التحديث");
    } else {
      addVehicle(data);
      toast.success("تمت الإضافة");
    }
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="المركبات"
        description="مركبات العملاء — يمكن للعميل امتلاك أكثر من مركبة"
        actions={
          canAdd ? (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              disabled={customers.length === 0}
              title={customers.length === 0 ? "أضف عميلاً أولاً" : undefined}
            >
              <Plus className="w-4 h-4" /> إضافة مركبة
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <Input
            className="ps-9"
            placeholder="بحث بالماركة أو اللوحة أو العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-56"
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
        >
          <option value="">كل العملاء</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Car className="w-5 h-5" />}
                title="لا توجد مركبات"
                description="أضف مركبات العملاء لربطها بفواتير الغسيل وطابور الاستقبال."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>العميل</TH>
                  <TH>الماركة</TH>
                  <TH>الموديل</TH>
                  <TH>رقم اللوحة</TH>
                  <TH>اللون</TH>
                  <TH>عدد الغسلات</TH>
                  <TH className="w-20"></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((v) => (
                  <TR key={v.id}>
                    <TD className="font-medium text-slate-900">{customerName.get(v.customerId) ?? "—"}</TD>
                    <TD>{v.brand || "—"}</TD>
                    <TD>{v.model || "—"}</TD>
                    <TD className="font-mono text-xs">{v.plateNumber}</TD>
                    <TD>{v.color || "—"}</TD>
                    <TD>{washCount.get(v.id) ?? 0}</TD>
                    <TD>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setHistoryVehicle(v)}
                          className="p-1.5 text-slate-400 hover:text-brand-600 transition-colors"
                          title="سجل الغسلات"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {canEdit ? (
                          <button
                            onClick={() => {
                              setEditing(v);
                              setOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-brand-600 transition-colors"
                            title="تعديل"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            onClick={() => setDelId(v.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "تعديل بيانات المركبة" : "إضافة مركبة جديدة"}
      >
        <form id="vehicleForm" onSubmit={handleSave} className="space-y-4 mt-4">
          <Field label="العميل" required>
            <Select name="customerId" defaultValue={editing?.customerId ?? ""} required>
              <option value="" disabled>
                اختر العميل
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الماركة" required>
              <Input name="brand" defaultValue={editing?.brand} required autoFocus />
            </Field>
            <Field label="الموديل">
              <Input name="model" defaultValue={editing?.model} />
            </Field>
            <Field label="رقم اللوحة" required>
              <Input name="plateNumber" defaultValue={editing?.plateNumber} required />
            </Field>
            <Field label="اللون">
              <Input name="color" defaultValue={editing?.color} />
            </Field>
          </div>
          <Field label="ملاحظات">
            <Textarea name="notes" defaultValue={editing?.notes} rows={2} />
          </Field>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit">حفظ</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={!!historyVehicle}
        onClose={() => setHistoryVehicle(null)}
        title={historyVehicle ? `سجل الغسلات — ${vehicleLabel(historyVehicle)}` : "سجل الغسلات"}
        width="lg"
      >
        {historyVehicle ? (
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
                <div className="text-[11px] text-slate-500">عدد الغسلات</div>
                <div className="text-lg font-bold text-slate-900">{historyStats.visits}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
                <div className="text-[11px] text-slate-500">إجمالي الإنفاق</div>
                <div className="text-lg font-bold text-emerald-700">{formatCurrency(historyStats.totalSpent, settings.currency)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
                <div className="text-[11px] text-slate-500">آخر غسلة</div>
                <div className="text-lg font-bold text-slate-900">{historyStats.lastVisit ? formatDate(historyStats.lastVisit) : "—"}</div>
              </div>
            </div>
            {historyInvoices.length === 0 ? (
              <EmptyState icon={<History className="w-5 h-5" />} title="لا توجد غسلات سابقة" description="لم تُسجَّل أي فاتورة غسيل لهذه المركبة بعد." />
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <Table>
                  <THead>
                    <TR>
                      <TH>الفاتورة</TH>
                      <TH>التاريخ</TH>
                      <TH>الخدمات</TH>
                      <TH className="text-end">الإجمالي</TH>
                      <TH className="text-end"></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {historyInvoices.map((inv) => (
                      <TR key={inv.id}>
                        <TD className="font-mono text-xs">{inv.invoiceNumber}</TD>
                        <TD>{formatDate(inv.date)}</TD>
                        <TD className="text-xs text-slate-600">
                          {inv.lines.filter((l) => l.kind === "service").map((l) => l.productName).join("، ") || "—"}
                        </TD>
                        <TD className="text-end font-medium">{formatCurrency(inv.total, settings.currency)}</TD>
                        <TD className="text-end">
                          <Link to={`/sales/${inv.id}`} className="text-xs text-brand-700 hover:underline" onClick={() => setHistoryVehicle(null)}>
                            عرض
                          </Link>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={!!delId}
        onClose={() => setDelId(null)}
        onConfirm={() => {
          if (!delId) return;
          const ok = deleteVehicle(delId);
          if (ok) {
            toast.success("تم الحذف");
          } else {
            toast.error("لا يمكن حذف مركبة مرتبطة بفواتير أو طابور");
          }
          setDelId(null);
        }}
        title="حذف المركبة"
        message="هل أنت متأكد من حذف هذه المركبة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="حذف نهائي"
        variant="danger"
      />
    </>
  );
}
