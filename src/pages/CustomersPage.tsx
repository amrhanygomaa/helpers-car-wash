import { useEffect, useMemo, useRef, useState } from "react";
import {
  Car,
  Eye,
  Pencil,
  Plus,
  Receipt,
  Search,
  ScrollText,
  Archive,
  ArchiveRestore,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Field } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { useCatalog } from "../store/CatalogContext";
import { useCarwash } from "../store/CarwashContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useReporting } from "../store/ReportingContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import type { Customer, SalesInvoice, Vehicle } from "../types";
import { Link, useNavigate } from "react-router-dom";
import { hasPermission } from "../lib/permissions";

export function CustomersPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, archiveCustomer, nextCustomerCode } = useCatalog();
  const { vehicles } = useCarwash();
  const { salesInvoices } = useInvoicing();
  const { customerBalance } = useReporting();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const canAddCustomer = hasPermission(currentUser, "customers", "add");
  const canEditCustomer = hasPermission(currentUser, "customers", "edit");
  const canDeleteCustomer = hasPermission(currentUser, "customers", "delete");

  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "/" || (e.ctrlKey && e.key === "f")) && searchRef.current && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [form, setForm] = useState<Omit<Customer, "id" | "createdAt">>({
    code: "",
    name: "",
    phone: "",
    address: "",
    shippingDirection: undefined,
    notes: "",
  });

  const archivedCount = useMemo(() => customers.filter((c) => c.archived).length, [customers]);

  const customerInsights = useMemo(() => {
    const map = new Map<
      string,
      {
        vehicles: Vehicle[];
        invoices: SalesInvoice[];
        lastInvoice?: SalesInvoice;
        totalSpent: number;
      }
    >();
    for (const c of customers) {
      const cv = vehicles.filter((v) => v.customerId === c.id);
      const ci = salesInvoices.filter((inv) => inv.customerId === c.id);
      const activeInvoices = ci.filter((i) => !i.cancelled);
      const totalSpent = activeInvoices.reduce((sum, inv) => sum + inv.total, 0);
      const sorted = [...ci].sort((a, b) => b.date.localeCompare(a.date));
      map.set(c.id, {
        vehicles: cv,
        invoices: ci,
        lastInvoice: sorted[0],
        totalSpent,
      });
    }
    return map;
  }, [customers, vehicles, salesInvoices]);

  const overview = useMemo(() => {
    const activeCustomers = customers.filter((c) => !c.archived).length;
    return {
      activeCustomers,
      vehicles: vehicles.length,
      washInvoices: salesInvoices.filter((inv) => !inv.cancelled).length,
    };
  }, [customers, vehicles, salesInvoices]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = customers.filter((c) => (showArchived ? c.archived : !c.archived));
    if (!term) return list;
    return list.filter((c) => {
      const matchName = c.name.toLowerCase().includes(term);
      const matchPhone = c.phone?.toLowerCase().includes(term);
      const insights = customerInsights.get(c.id);
      const matchPlate = insights?.vehicles.some((v) => v.plateNumber.toLowerCase().includes(term));
      return matchName || matchPhone || matchPlate;
    });
  }, [customers, showArchived, q, customerInsights]);

  function openNew() {
    setEditing(null);
    setForm({
      code: `CUS-${String(nextCustomerCode).padStart(4, "0")}`,
      name: "",
      phone: "",
      address: "",
      shippingDirection: undefined,
      notes: "",
    });
    setOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      code: c.code ?? "",
      name: c.name,
      phone: c.phone ?? "",
      address: c.address ?? "",
      shippingDirection: c.shippingDirection,
      notes: c.notes ?? "",
    });
    setOpen(true);
  }
  function submit() {
    if (form.phone && form.phone.trim().replace(/\D/g, "").length !== 11) {
      toast.error("رقم الهاتف غير صحيح", "يجب أن يكون رقم الهاتف مكوناً من 11 رقماً بالضبط");
      return;
    }
    const payload = { ...form, name: form.name.trim() || "عميل بدون اسم" };
    if (editing) {
      updateCustomer(editing.id, payload);
      toast.success("تم تحديث العميل");
    } else {
      addCustomer(payload);
      toast.success("تم إضافة العميل");
    }
    setOpen(false);
  }
  function handleDelete() {
    if (!toDelete) return;
    const ok = deleteCustomer(toDelete.id);
    if (ok) {
      toast.success("تم حذف العميل");
    } else {
      archiveCustomer(toDelete.id, true);
      toast.success("تم أرشفة العميل", "العميل محفوظ في الأرشيف ويمكن استعادته");
    }
    setToDelete(null);
  }

  return (
    <>
      <PageHeader
        title="العملاء"
        description={`ملفات العملاء، السيارات، آخر غسلة، والأرصدة (${customers.length})`}
        actions={
          canAddCustomer ? (
            <Button onClick={openNew}>
              <Plus className="w-4 h-4" />
              إضافة عميل
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <CustomerStat icon={<Users className="h-5 w-5" />} label="عملاء نشطون" value={String(overview.activeCustomers)} tone="blue" />
        <CustomerStat icon={<Car className="h-5 w-5" />} label="سيارات مسجلة" value={String(overview.vehicles)} tone="slate" />
        <CustomerStat icon={<Receipt className="h-5 w-5" />} label="فواتير غسيل" value={String(overview.washInvoices)} tone="green" />
      </div>

      <Card>
        <CardHeader
          title="قائمة العملاء"
          actions={archivedCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-slate-600"
              onClick={() => setShowArchived((v) => !v)}
            >
              <Archive className="w-3.5 h-3.5" />
              {showArchived ? "إخفاء الأرشيف" : `الأرشيف (${archivedCount})`}
            </Button>
          ) : undefined}
        />
        <CardBody className="space-y-3">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 end-3 text-slate-400" />
            <Input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف أو اللوحة"
              className="pe-9"
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="w-5 h-5" />}
              title="لا يوجد عملاء"
              description="ابدأ بإضافة أول عميل."
              action={
                canAddCustomer ? (
                  <Button onClick={openNew}><Plus className="w-4 h-4" /> إضافة عميل</Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الكود</TH>
                  <TH>اسم العميل</TH>
                  <TH>الهاتف</TH>
                  <TH>السيارات</TH>
                  <TH>آخر غسلة</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => {
                  const insights = customerInsights.get(c.id);
                  return (
                    <TR key={c.id}>
                      <TD className="text-slate-500 font-mono text-xs">{c.code ?? "—"}</TD>
                      <TD className="font-semibold text-slate-900">
                        <Link to={`/customers/${c.id}`} className="hover:underline text-brand-700">
                          {c.name}
                        </Link>
                        {settings.loyaltyEnabled && (c.loyaltyPoints ?? 0) > 0 ? (
                          <span className="ms-2 inline-flex items-center text-[11px] font-normal text-amber-600">⭐ {c.loyaltyPoints}</span>
                        ) : null}
                      </TD>
                      <TD className="text-slate-600">{c.phone ?? "—"}</TD>
                      <TD>
                        {insights?.vehicles.length ? (
                          <div className="flex flex-wrap gap-1">
                            {insights.vehicles.slice(0, 2).map((vehicle) => (
                              <Badge key={vehicle.id} tone="blue">{vehicle.plateNumber}</Badge>
                            ))}
                            {insights.vehicles.length > 2 ? <Badge tone="slate">+{insights.vehicles.length - 2}</Badge> : null}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">لا توجد سيارة</span>
                        )}
                      </TD>
                      <TD className="text-slate-600">{insights?.lastInvoice ? formatDate(insights.lastInvoice.date) : "—"}</TD>
                      <TD className="text-end">
                        <div className="inline-flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => navigate(`/customers/${c.id}`)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEditCustomer ? (
                            <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          ) : null}
                          {canDeleteCustomer ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => setToDelete(c)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
                {showArchived && customers.filter((c) => c.archived).map((c) => (
                  <TR key={c.id} className="opacity-50 bg-slate-50">
                    <TD className="text-slate-400 font-mono text-xs">{c.code ?? "—"}</TD>
                    <TD className="text-slate-500 line-through">{c.name}</TD>
                    <TD className="text-slate-400">{c.phone ?? "—"}</TD>
                    <TD />
                    <TD />
                    <TD className="text-end">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-slate-600 h-7 text-xs"
                          onClick={() => { archiveCustomer(c.id, false); toast.success("تمت الاستعادة"); }}
                        >
                          <ArchiveRestore className="w-3 h-3" />
                          استعادة
                        </Button>
                        {canDeleteCustomer && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 w-7 h-7"
                            onClick={() => setToDelete(c)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "تعديل عميل" : "إضافة عميل"}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={submit}>{editing ? "حفظ" : "إضافة"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="كود العميل">
            <Input
              value={form.code ?? ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed text-gray-600 font-mono"
            />
          </Field>
          <Field label="اسم العميل">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="الهاتف">
            <Input
              value={form.phone ?? ""}
              maxLength={11}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <Field label="المنطقة / العنوان">
            <Input
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="حذف عميل"
        message={`هل أنت متأكد من حذف "${toDelete?.name}"؟`}
        variant="danger"
        confirmText="حذف"
      />
    </>
  );
}

function CustomerStat({
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
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${tones[tone]}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-lg font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}
