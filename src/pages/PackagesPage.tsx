import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Package, Pencil, Plus, ShoppingCart } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Field, Input, Select } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../store/AuthContext";
import { useCatalog } from "../store/CatalogContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { hasPermissionKey } from "../lib/permissions";
import { piastresToEgp, egpToPiastres } from "../lib/money";
import { formatDate } from "../lib/format";
import { todayISO, uid } from "../lib/utils";
import { hasDb } from "../db/client";
import { addDaysISO, subscriptionStatusLabel } from "../lib/subscriptions";
import {
  listAllPackages,
  createPackage,
  updatePackage,
  listSubscriptionsForCustomer,
  sellSubscription,
  type WashPackage,
  type CustomerSubscription,
} from "../features/subscriptions/queries";

const CURRENCY = "ج.م";
const fmtEgp = (piastres: number) => `${piastresToEgp(piastres).toFixed(2)} ${CURRENCY}`;

// ── Package form ──────────────────────────────────────────────────────────────

interface PkgFormState {
  name: string;
  kind: "count" | "period";
  price: string;
  washCount: string;
  durationDays: string;
  active: boolean;
}

function emptyForm(): PkgFormState {
  return { name: "", kind: "count", price: "", washCount: "10", durationDays: "30", active: true };
}

function PackageForm({
  open,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  initial?: WashPackage | null;
  onSave: (data: PkgFormState) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<PkgFormState>(emptyForm());

  useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? {
            name: initial.name,
            kind: initial.kind,
            price: piastresToEgp(initial.price).toString(),
            washCount: initial.washCount?.toString() ?? "10",
            durationDays: initial.durationDays?.toString() ?? "30",
            active: initial.active,
          }
        : emptyForm()
    );
  }, [open, initial]);

  function set<K extends keyof PkgFormState>(k: K, v: PkgFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? "تعديل باقة" : "باقة جديدة"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => onSave(form)}>{initial ? "حفظ" : "إضافة"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="اسم الباقة" required className="col-span-2">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="مثل: باقة 10 غسلات" autoFocus />
        </Field>
        <Field label="نوع الباقة">
          <Select value={form.kind} onChange={(e) => set("kind", e.target.value as "count" | "period")}>
            <option value="count">عدد غسلات</option>
            <option value="period">اشتراك بمدة</option>
          </Select>
        </Field>
        <Field label="السعر" required>
          <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
        {form.kind === "count" ? (
          <Field label="عدد الغسلات" required>
            <Input type="number" min={1} value={form.washCount} onChange={(e) => set("washCount", e.target.value)} />
          </Field>
        ) : (
          <Field label="المدة (أيام)" required>
            <Input type="number" min={1} value={form.durationDays} onChange={(e) => set("durationDays", e.target.value)} />
          </Field>
        )}
        <Field label="الحالة">
          <label className="flex items-center gap-2 h-9 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
            مفعّلة
          </label>
        </Field>
      </div>
    </Dialog>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function PackagesPage() {
  const { currentUser } = useAuth();
  const { customers } = useCatalog();
  const { addCashEntry } = useInvoicing();
  const { settings } = useSettings();
  const toast = useToast();
  const canManage = hasPermissionKey(currentUser, "products.manage");

  const [packages, setPackages] = useState<WashPackage[]>([]);
  const [subs, setSubs] = useState<CustomerSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WashPackage | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellCustomerId, setSellCustomerId] = useState("");
  const [sellPackageId, setSellPackageId] = useState("");

  const activeCustomers = useMemo(() => customers.filter((c) => !c.archived), [customers]);
  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const reload = useCallback(async () => {
    if (!hasDb()) { setLoading(false); return; }
    setLoading(true);
    try {
      const pkgs = await listAllPackages();
      setPackages(pkgs);
      // Recent subscriptions across all customers (for the activity list).
      const all = await Promise.all(activeCustomers.map((c) => listSubscriptionsForCustomer(c.id)));
      setSubs(all.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50));
    } catch {
      toast.error("تعذّر تحميل الباقات");
    } finally {
      setLoading(false);
    }
  }, [activeCustomers, toast]);

  useEffect(() => { void reload(); }, [reload]);

  async function savePackage(data: PkgFormState) {
    const price = egpToPiastres(parseFloat(data.price || "0"));
    if (!data.name.trim()) { toast.error("اسم الباقة مطلوب"); return; }
    if (price < 0) { toast.error("سعر غير صحيح"); return; }
    try {
      if (editing) {
        await updatePackage(editing.id, {
          name: data.name.trim(),
          price,
          washCount: data.kind === "count" ? parseInt(data.washCount || "0", 10) : null,
          durationDays: data.kind === "period" ? parseInt(data.durationDays || "0", 10) : null,
          active: data.active,
        });
        toast.success("تم تحديث الباقة");
      } else {
        await createPackage({
          id: uid("pkg"),
          name: data.name.trim(),
          kind: data.kind,
          price,
          washCount: data.kind === "count" ? parseInt(data.washCount || "0", 10) : undefined,
          durationDays: data.kind === "period" ? parseInt(data.durationDays || "0", 10) : undefined,
          active: data.active,
          createdAt: new Date().toISOString(),
        });
        toast.success("تمت إضافة الباقة");
      }
      setFormOpen(false);
      setEditing(null);
      await reload();
    } catch {
      toast.error("تعذّر حفظ الباقة");
    }
  }

  async function confirmSell() {
    const customer = customers.find((c) => c.id === sellCustomerId);
    const pkg = packages.find((p) => p.id === sellPackageId);
    if (!customer) { toast.error("اختر العميل"); return; }
    if (!pkg) { toast.error("اختر الباقة"); return; }
    const today = todayISO();
    try {
      await sellSubscription({
        id: uid("sub"),
        customerId: customer.id,
        pkg,
        startDate: today,
        endDate: pkg.kind === "period" && pkg.durationDays ? addDaysISO(today, pkg.durationDays) : null,
        branchId: settings.currentBranchId || "branch-main",
        createdBy: currentUser?.id,
        createdAt: new Date().toISOString(),
      });
      // Record the prepaid cash as revenue in the cashbox.
      addCashEntry({
        type: "sales-receipt",
        amount: piastresToEgp(pkg.price),
        description: `بيع باقة "${pkg.name}" — ${customer.name}`,
        date: today,
        paymentMethod: "cash",
      });
      toast.success("تم بيع الباقة", `${pkg.name} — ${customer.name}`);
      setSellOpen(false);
      setSellCustomerId("");
      setSellPackageId("");
      await reload();
    } catch {
      toast.error("تعذّر بيع الباقة");
    }
  }

  if (!hasDb()) {
    return (
      <>
        <PageHeader title="الاشتراكات والباقات" description="باقات الغسيل المدفوعة مقدماً" />
        <Card><CardBody><EmptyState icon={<Package className="w-5 h-5" />} title="غير متاح" description="هذه الميزة تعمل داخل تطبيق سطح المكتب فقط." /></CardBody></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="الاشتراكات والباقات"
        description="عرّف باقات الغسيل المدفوعة مقدماً وبِعها للعملاء — تُخصم آلياً عند الفوترة."
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSellOpen(true)} disabled={packages.filter((p) => p.active).length === 0}>
                <ShoppingCart className="w-4 h-4" /> بيع باقة
              </Button>
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="w-4 h-4" /> باقة جديدة
              </Button>
            </div>
          ) : null
        }
      />

      <Card className="mb-4">
        <CardHeader title="الباقات المتاحة" />
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 text-center text-slate-400 text-sm">جارٍ التحميل…</div>
          ) : packages.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={<Package className="w-6 h-6" />} title="لا توجد باقات" description="أضف أول باقة غسيل مدفوعة مقدماً." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الباقة</TH>
                  <TH>النوع</TH>
                  <TH>التفاصيل</TH>
                  <TH className="text-end">السعر</TH>
                  <TH>الحالة</TH>
                  <TH className="w-10"></TH>
                </TR>
              </THead>
              <TBody>
                {packages.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium text-slate-900">{p.name}</TD>
                    <TD>{p.kind === "count" ? "عدد غسلات" : "اشتراك بمدة"}</TD>
                    <TD className="text-slate-600 text-sm">
                      {p.kind === "count" ? `${p.washCount ?? 0} غسلة` : `${p.durationDays ?? 0} يوم`}
                    </TD>
                    <TD className="text-end font-medium">{fmtEgp(p.price)}</TD>
                    <TD>{p.active ? <Badge tone="green">مفعّلة</Badge> : <Badge tone="slate">موقوفة</Badge>}</TD>
                    <TD>
                      {canManage ? (
                        <button onClick={() => { setEditing(p); setFormOpen(true); }} className="p-1.5 text-slate-400 hover:text-brand-600" title="تعديل">
                          <Pencil className="w-4 h-4" />
                        </button>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="اشتراكات العملاء" subtitle="أحدث الاشتراكات المُباعة وحالتها" />
        <CardBody className="p-0">
          {subs.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={<BadgeCheck className="w-6 h-6" />} title="لا توجد اشتراكات" description="بِع باقة لعميل لتظهر هنا." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>العميل</TH>
                  <TH>الباقة</TH>
                  <TH>المتبقي</TH>
                  <TH>ينتهي</TH>
                  <TH>الحالة</TH>
                  <TH>تاريخ البيع</TH>
                </TR>
              </THead>
              <TBody>
                {subs.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium text-slate-900">{customerName.get(s.customerId) ?? "—"}</TD>
                    <TD>{s.packageName}</TD>
                    <TD>{s.kind === "count" ? `${s.remainingWashes ?? 0} / ${s.totalWashes ?? 0}` : "غير محدود"}</TD>
                    <TD className="text-slate-600">{s.endDate ? formatDate(s.endDate) : "—"}</TD>
                    <TD>
                      {(() => {
                        const label = subscriptionStatusLabel(s, todayISO());
                        const tone = label === "فعّال" ? "green" : label === "ملغي" ? "red" : "slate";
                        return <Badge tone={tone}>{label}</Badge>;
                      })()}
                    </TD>
                    <TD className="text-slate-500 text-xs">{formatDate(s.createdAt.slice(0, 10))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <PackageForm open={formOpen} initial={editing} onSave={savePackage} onClose={() => { setFormOpen(false); setEditing(null); }} />

      <Dialog
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        title="بيع باقة لعميل"
        footer={
          <>
            <Button variant="outline" onClick={() => setSellOpen(false)}>إلغاء</Button>
            <Button onClick={confirmSell}>تأكيد البيع</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="العميل" required>
            <Select value={sellCustomerId} onChange={(e) => setSellCustomerId(e.target.value)}>
              <option value="" disabled>اختر العميل</option>
              {activeCustomers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="الباقة" required>
            <Select value={sellPackageId} onChange={(e) => setSellPackageId(e.target.value)}>
              <option value="" disabled>اختر الباقة</option>
              {packages.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {fmtEgp(p.price)}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-slate-500">
            يُسجَّل سعر الباقة كإيراد في الخزنة فوراً، ويبدأ الاشتراك من اليوم.
          </p>
        </div>
      </Dialog>
    </>
  );
}
