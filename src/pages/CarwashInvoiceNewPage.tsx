import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Check, Plus, Save, Tag, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { useCatalog } from "../store/CatalogContext";
import { useCarwash } from "../store/CarwashContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { vehicleLabel } from "./VehiclesPage";
import { formatCurrency } from "../lib/format";
import { piastresToEgp } from "../lib/money";
import { todayISO, uid } from "../lib/utils";
import { hasDb } from "../db/client";
import { listActiveWorkers, type Worker } from "../features/workers/queries";
import { listActiveCarwashProducts, recordProductSale, type Product as CarwashProduct } from "../features/products/carwash-queries";
import { listActiveRawMaterials, recordMaterialConsumption, type RawMaterial } from "../features/materials/queries";
import { listUsableSubscriptions, redeemSubscription, type CustomerSubscription } from "../features/subscriptions/queries";
import { expandServiceMaterials, splitCommissionEvenly } from "../store/_pure";
import { printServiceInvoice } from "../lib/print";
import { computeDiscount, computeServiceCommission } from "../lib/carwash";
import type { DiscountCode, InvoiceLine, PaymentMethod, SalesPaymentType } from "../types";

interface LineWorkerDraft {
  workerId: string;
  commissionAmount: number;
}

interface ServiceLineDraft {
  id: string;
  serviceId: string;
  quantity: number;
  price: number;
  /** One or more صنايعية sharing this line's commission. Empty = unassigned. */
  workers: LineWorkerDraft[];
}

interface ProductLineDraft {
  id: string;
  productId: string;
  quantity: number;
  price: number; // EGP decimal (from piastresToEgp(product.salePrice))
}

function nextInvoiceNumber(existing: string[]): string {
  const nums = existing
    .map((x) => parseInt(x.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const currentMax = nums.length ? Math.max(...nums) : 1000;
  const storedMax = parseInt(localStorage.getItem("seq_sales_invoice") || "0", 10);
  return `INV-${Math.max(currentMax, storedMax) + 1}`;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "نقدي" },
  { value: "bank", label: "تحويل بنكي" },
  { value: "vodafone", label: "فودافون كاش" },
  { value: "instapay", label: "إنستا باي" },
  { value: "other", label: "أخرى" },
];

export function CarwashInvoiceNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queueId = params.get("queue") ?? "";
  const customerParam = params.get("customerId") ?? "";

  const { customers: allCustomers } = useCatalog();
  const { vehicles, washServices, queueTickets, updateQueueTicket, setQueueStatus } = useCarwash();
  const { salesInvoices, addSalesInvoice, discountCodes } = useInvoicing();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();

  const customers = useMemo(() => allCustomers.filter((c) => !c.archived), [allCustomers]);
  const activeServices = useMemo(() => washServices.filter((s) => s.active), [washServices]);
  const activeCodes = useMemo(() => discountCodes.filter((c) => c.active), [discountCodes]);

  const ticket = useMemo(() => queueTickets.find((t) => t.id === queueId), [queueTickets, queueId]);

  // Workers (صنايعية) and products from relational DB
  const [dbWorkers, setDbWorkers] = useState<Worker[]>([]);
  const [dbProducts, setDbProducts] = useState<CarwashProduct[]>([]);
  const [dbMaterials, setDbMaterials] = useState<RawMaterial[]>([]);
  useEffect(() => {
    if (hasDb()) {
      listActiveWorkers().then(setDbWorkers).catch(() => {});
      listActiveCarwashProducts().then(setDbProducts).catch(() => {});
      listActiveRawMaterials().then(setDbMaterials).catch(() => {});
    }
  }, []);

  const [invoiceNumber] = useState(() => nextInvoiceNumber(salesInvoices.map((s) => s.invoiceNumber)));
  const [date, setDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState(() => {
    if (ticket?.customerId) return ticket.customerId;
    if (customerParam && customers.some((customer) => customer.id === customerParam)) return customerParam;
    return customers[0]?.id ?? "";
  });
  const [vehicleId, setVehicleId] = useState(() => ticket?.vehicleId ?? "");

  const [lines, setLines] = useState<ServiceLineDraft[]>(() => {
    const selectedIds = ticket?.serviceIds?.filter((id) => activeServices.some((s) => s.id === id)) ?? [];
    return selectedIds.map((serviceId) => {
      const service = activeServices.find((s) => s.id === serviceId)!;
      return { id: uid("ln"), serviceId, quantity: 1, price: service.defaultPrice, workers: [] };
    });
  });

  const [productLines, setProductLines] = useState<ProductLineDraft[]>([]);

  const [commissionInTotal, setCommissionInTotal] = useState(false);
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<DiscountCode | null>(null);

  const [notes, setNotes] = useState("");
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [usableSubs, setUsableSubs] = useState<CustomerSubscription[]>([]);
  const [useSubscriptionId, setUseSubscriptionId] = useState("");
  const [paymentType, setPaymentType] = useState<SalesPaymentType>("cash");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [paymentDueDate, setPaymentDueDate] = useState("");

  const customerVehicles = useMemo(
    () => vehicles.filter((v) => v.customerId === customerId && !v.archived),
    [vehicles, customerId]
  );

  // Load the selected customer's usable subscriptions (Car Wash — packages).
  useEffect(() => {
    setUseSubscriptionId("");
    if (hasDb() && customerId) {
      listUsableSubscriptions(customerId, todayISO()).then(setUsableSubs).catch(() => setUsableSubs([]));
    } else {
      setUsableSubs([]);
    }
  }, [customerId]);

  // Computed totals (services + products before discount)
  const serviceSubtotal = useMemo(() => lines.reduce((sum, l) => sum + l.price * l.quantity, 0), [lines]);
  const productSubtotal = useMemo(() => productLines.reduce((sum, l) => sum + l.price * l.quantity, 0), [productLines]);
  const subtotal = serviceSubtotal + productSubtotal;
  const discountAmt = useMemo(() => (appliedCode ? computeDiscount(subtotal, appliedCode) : 0), [subtotal, appliedCode]);
  const afterCode = Math.max(0, subtotal - discountAmt);

  // Subscription redemption — a used package covers the wash (service portion).
  const activeSubscription = usableSubs.find((s) => s.id === useSubscriptionId);
  const subscriptionDiscount = activeSubscription ? Math.min(serviceSubtotal, afterCode) : 0;
  const preLoyaltyTotal = Math.max(0, afterCode - subscriptionDiscount);

  // Loyalty redemption — points → EGP discount, capped at balance and at the bill.
  const pointValue = settings.loyaltyPointValue ?? 0;
  const availablePoints = useMemo(
    () => customers.find((c) => c.id === customerId)?.loyaltyPoints ?? 0,
    [customers, customerId]
  );
  const maxRedeemablePoints =
    settings.loyaltyEnabled && pointValue > 0
      ? Math.min(availablePoints, Math.floor(preLoyaltyTotal / pointValue))
      : 0;
  const effectiveRedeem = Math.max(0, Math.min(redeemPoints, maxRedeemablePoints));
  const loyaltyDiscount = effectiveRedeem * pointValue;
  const total = Math.max(0, preLoyaltyTotal - loyaltyDiscount);
  const commissionTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.workers.reduce((s, w) => s + (w.commissionAmount ?? 0), 0), 0),
    [lines]
  );
  const remainingDue = Math.max(0, total - (paymentType === "cash" ? amountReceived : 0));

  const anyLineHasCommission = useMemo(
    () => lines.some((l) => activeServices.find((s) => s.id === l.serviceId)?.hasCommission),
    [lines, activeServices]
  );

  // Service line CRUD ─ commission is auto-calculated from the service's % and
  // split evenly across the line's assigned صنايعية (each share editable).
  function targetCommission(svc: (typeof activeServices)[number] | undefined, price: number, qty: number): number {
    return svc?.hasCommission ? computeServiceCommission(price, qty, svc.commissionPct) : 0;
  }

  function resplit(workers: LineWorkerDraft[], svc: (typeof activeServices)[number] | undefined, price: number, qty: number): LineWorkerDraft[] {
    const shares = splitCommissionEvenly(targetCommission(svc, price, qty), workers.length);
    return workers.map((w, i) => ({ ...w, commissionAmount: shares[i] ?? 0 }));
  }

  function addLine() {
    const svc = activeServices[0];
    if (!svc) { toast.error("لا توجد خدمات مفعّلة — أضف خدمات أولاً"); return; }
    setLines((l) => [...l, { id: uid("ln"), serviceId: svc.id, quantity: 1, price: svc.defaultPrice, workers: [] }]);
  }

  function removeLine(id: string) {
    setLines((l) => l.filter((row) => row.id !== id));
  }

  function onServiceChange(id: string, serviceId: string) {
    const svc = activeServices.find((s) => s.id === serviceId);
    const price = svc?.defaultPrice ?? 0;
    setLines((l) => l.map((row) => (row.id === id ? { ...row, serviceId, price, workers: resplit(row.workers, svc, price, row.quantity) } : row)));
  }

  function onPriceChange(lineId: string, newPrice: number) {
    setLines((l) => l.map((row) => {
      if (row.id !== lineId) return row;
      const svc = activeServices.find((s) => s.id === row.serviceId);
      return { ...row, price: newPrice, workers: resplit(row.workers, svc, newPrice, row.quantity) };
    }));
  }

  function onQuantityChange(lineId: string, newQty: number) {
    setLines((l) => l.map((row) => {
      if (row.id !== lineId) return row;
      const svc = activeServices.find((s) => s.id === row.serviceId);
      return { ...row, quantity: newQty, workers: resplit(row.workers, svc, row.price, newQty) };
    }));
  }

  // Per-line صنايعية management
  function addWorker(lineId: string) {
    setLines((l) => l.map((row) => {
      if (row.id !== lineId) return row;
      const used = new Set(row.workers.map((w) => w.workerId));
      const next = dbWorkers.find((w) => !used.has(w.id)) ?? dbWorkers[0];
      if (!next) return row;
      const svc = activeServices.find((s) => s.id === row.serviceId);
      const workers = [...row.workers, { workerId: next.id, commissionAmount: 0 }];
      return { ...row, workers: resplit(workers, svc, row.price, row.quantity) };
    }));
  }

  function removeWorker(lineId: string, index: number) {
    setLines((l) => l.map((row) => {
      if (row.id !== lineId) return row;
      const svc = activeServices.find((s) => s.id === row.serviceId);
      const workers = row.workers.filter((_, i) => i !== index);
      return { ...row, workers: resplit(workers, svc, row.price, row.quantity) };
    }));
  }

  function setWorkerId(lineId: string, index: number, workerId: string) {
    setLines((l) => l.map((row) =>
      row.id === lineId ? { ...row, workers: row.workers.map((w, i) => (i === index ? { ...w, workerId } : w)) } : row
    ));
  }

  function setWorkerCommission(lineId: string, index: number, amount: number) {
    setLines((l) => l.map((row) =>
      row.id === lineId ? { ...row, workers: row.workers.map((w, i) => (i === index ? { ...w, commissionAmount: amount } : w)) } : row
    ));
  }

  // Product add-on CRUD
  function addProductLine() {
    const prod = dbProducts[0];
    if (!prod) { toast.error("لا توجد إضافات متاحة — أضف إضافة أولاً"); return; }
    setProductLines((l) => [...l, { id: uid("pln"), productId: prod.id, quantity: 1, price: piastresToEgp(prod.salePrice) }]);
  }

  function updateProductLine(id: string, patch: Partial<ProductLineDraft>) {
    setProductLines((l) => l.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeProductLine(id: string) {
    setProductLines((l) => l.filter((row) => row.id !== id));
  }

  function onProductChange(id: string, productId: string) {
    const prod = dbProducts.find((p) => p.id === productId);
    updateProductLine(id, { productId, price: prod ? piastresToEgp(prod.salePrice) : 0 });
  }

  // Discount
  function applyCode() {
    const input = discountCodeInput.trim();
    if (!input) return;
    const code = activeCodes.find((c) => c.code.toLowerCase() === input.toLowerCase());
    if (!code) { toast.error("كود الخصم غير موجود أو منتهي الصلاحية"); return; }
    setAppliedCode(code);
    const label = code.type === "percent" ? `${code.value}%` : formatCurrency(code.value, settings.currency);
    toast.success(`تم تطبيق كود الخصم — ${label} خصم`);
  }

  function removeCode() {
    setAppliedCode(null);
    setDiscountCodeInput("");
  }

  async function submit() {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) { toast.error("اختر العميل"); return; }
    if (lines.length === 0 && productLines.length === 0) { toast.error("أضف خدمة أو إضافة واحدة على الأقل"); return; }
    if (lines.some((l) => !l.serviceId || l.quantity <= 0)) { toast.error("تحقق من بنود الخدمات"); return; }
    if (productLines.some((l) => !l.productId || l.quantity <= 0)) { toast.error("تحقق من بنود الإضافات"); return; }
    if (amountReceived < 0) { toast.error("المبلغ المستلم غير صحيح"); return; }
    if ((paymentType === "account" || remainingDue > 0) && !paymentDueDate) {
      toast.error("حدد تاريخ استحقاق المبلغ المتبقي"); return;
    }

    // Stock validation — can't go negative
    for (const pl of productLines) {
      const prod = dbProducts.find((p) => p.id === pl.productId);
      if (prod && prod.stockQty < pl.quantity) {
        toast.error(`الكمية المتاحة من "${prod.name}" غير كافية (متاح: ${prod.stockQty})`);
        return;
      }
    }

    const vehicle = vehicles.find((v) => v.id === vehicleId);
    const serviceInvLines: InvoiceLine[] = lines.map((l) => {
      const svc = activeServices.find((s) => s.id === l.serviceId)!;
      const assigned = l.workers
        .filter((w) => w.workerId)
        .map((w) => ({
          workerId: w.workerId,
          workerName: dbWorkers.find((d) => d.id === w.workerId)?.name,
          commissionAmount: w.commissionAmount,
        }));
      const lineCommission = assigned.reduce((s, w) => s + (w.commissionAmount ?? 0), 0);
      return {
        id: uid("sline"),
        productId: "",
        productName: svc.name,
        unit: "خدمة",
        quantity: l.quantity,
        price: l.price,
        subtotal: l.price * l.quantity,
        kind: "service",
        serviceId: svc.id,
        // Legacy single-worker mirror (first assigned) for back-compat display.
        employeeId: assigned[0]?.workerId,
        employeeName: assigned[0]?.workerName,
        workers: assigned.length > 0 ? assigned : undefined,
        commissionAmount: lineCommission > 0 ? lineCommission : undefined,
        commissionInTotal: lineCommission > 0 ? commissionInTotal : undefined,
      };
    });

    const productInvLines: InvoiceLine[] = productLines.map((l) => {
      const prod = dbProducts.find((p) => p.id === l.productId)!;
      return {
        id: uid("pline"),
        productId: l.productId,
        productName: prod.name,
        unit: "قطعة",
        quantity: l.quantity,
        price: l.price,
        subtotal: l.price * l.quantity,
        kind: "product",
      };
    });

    const invLines = [...serviceInvLines, ...productInvLines];
    const actualCashReceived = paymentType === "cash" ? Math.min(amountReceived, total) : 0;
    const cashOverpayment = paymentType === "cash" ? Math.max(0, amountReceived - total) : 0;
    const effectivePaymentType: SalesPaymentType = remainingDue > 0 ? "account" : paymentType;

    const inv = addSalesInvoice({
      invoiceNumber,
      date,
      customerId,
      customerName: customer.name,
      lines: invLines,
      total,
      amountReceived: actualCashReceived,
      overpayment: cashOverpayment > 0 ? cashOverpayment : undefined,
      paymentType: effectivePaymentType,
      paymentMethod,
      priceType: "retail",
      paymentDueDate: remainingDue > 0 ? paymentDueDate : undefined,
      notes: notes.trim() || undefined,
      createdByUserId: currentUser?.id,
      invoiceKind: "service",
      vehicleId: vehicle?.id,
      vehicleLabel: vehicle ? vehicleLabel(vehicle) : undefined,
      queueId: ticket?.id,
      finalizedAt: new Date().toISOString(),
      commissionInTotal: commissionTotal > 0 ? commissionInTotal : undefined,
      commissionTotal: commissionTotal > 0 ? commissionTotal : undefined,
      loyaltyPointsRedeemed: effectiveRedeem > 0 ? effectiveRedeem : undefined,
      discountCodeId: appliedCode?.id,
      discountCode: appliedCode?.code,
      discountCodeType: appliedCode?.type,
      discountCodeValue: appliedCode?.value,
    });

    if (ticket) {
      updateQueueTicket(ticket.id, { invoiceId: inv.id });
      setQueueStatus(ticket.id, "done");
    }

    const issuedNum = parseInt(inv.invoiceNumber.replace(/\D/g, ""), 10);
    if (!Number.isNaN(issuedNum)) {
      const storedMax = parseInt(localStorage.getItem("seq_sales_invoice") || "0", 10);
      localStorage.setItem("seq_sales_invoice", Math.max(storedMax, issuedNum).toString());
    }

    // Decrement product stock (FR-PROD-3)
    if (hasDb() && productLines.length > 0) {
      const now = new Date().toISOString();
      await Promise.allSettled(
        productLines.map((l) =>
          recordProductSale({
            movementId: uid("mov"),
            productId: l.productId,
            qty: l.quantity,
            unitPrice: Math.round(l.price * 100),
            orderId: undefined,
            branchId: settings.currentBranchId || "branch-main",
            businessDate: todayISO(),
            createdBy: currentUser?.id,
            createdAt: now,
          })
        )
      );
    }

    // Consume BOM raw materials from DB inventory per service performed (feature 7 / FR-MAT).
    // expandServiceMaterials aggregates per-service material rows × line quantity.
    // Settled (not awaited per-item) so an insufficient-stock material never blocks the
    // confirmed wash — the work is already done; the operator reconciles from the materials page.
    if (hasDb()) {
      const now = new Date().toISOString();
      const consumptions = expandServiceMaterials(invLines, washServices);
      await Promise.allSettled(
        consumptions.map((c) => {
          const material = dbMaterials.find((m) => m.id === c.materialId);
          return recordMaterialConsumption({
            movementId: uid("mc"),
            materialId: c.materialId,
            qty: c.quantity,
            unitCost: material?.unitCost ?? 0,
            branchId: settings.currentBranchId || "branch-main",
            businessDate: todayISO(),
            byUserId: currentUser?.id,
            createdAt: now,
          });
        })
      );
    }

    // Redeem the subscription that covered this wash (decrements a count package).
    if (hasDb() && activeSubscription) {
      try {
        await redeemSubscription({
          redemptionId: uid("redm"),
          subscriptionId: activeSubscription.id,
          orderId: inv.id,
          customerId,
          washesUsed: 1,
          businessDate: todayISO(),
          createdAt: new Date().toISOString(),
        });
      } catch {
        toast.error("تعذّر خصم الاشتراك — راجع رصيد الباقة");
      }
    }

    // Print 80mm invoice
    printServiceInvoice({
      invoice: inv,
      businessName: settings.companyName ?? "Top Gear",
      currency: settings.currency,
    });

    toast.success("تم تأكيد فاتورة الغسيل", `رقم ${inv.invoiceNumber}`);
    navigate(`/sales/${inv.id}`);
  }

  return (
    <>
      <PageHeader
        title="فاتورة غسيل جديدة"
        description="أدخل الخدمات والصنايعي والإضافات والخصم — تُؤكَّد الفاتورة وتُطبع فور الحفظ."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowRight className="w-4 h-4" /> رجوع
            </Button>
            <Button onClick={submit}>
              <Save className="w-4 h-4" /> تأكيد وطباعة
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Basic data */}
        <Card className="lg:col-span-2">
          <CardHeader title="البيانات الأساسية" />
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="رقم الفاتورة">
              <Input value={invoiceNumber} readOnly className="bg-slate-100 font-mono" />
            </Field>
            <Field label="التاريخ">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="العميل" required>
              <Select
                title="العميل"
                value={customerId}
                onChange={(e) => { setCustomerId(e.target.value); setVehicleId(""); }}
              >
                <option value="" disabled>اختر العميل</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="المركبة" hint={customerVehicles.length === 0 ? "لا توجد مركبات لهذا العميل" : undefined}>
              <Select title="المركبة" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">— بدون مركبة —</option>
                {customerVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader title="الدفع" />
          <CardBody className="space-y-4">
            <Field label="نوع الدفع">
              <Select title="نوع الدفع" value={paymentType} onChange={(e) => setPaymentType(e.target.value as SalesPaymentType)}>
                <option value="cash">نقدي</option>
                <option value="account">آجل</option>
              </Select>
            </Field>
            <Field label="طريقة الدفع">
              <Select title="طريقة الدفع" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="المبلغ المستلم">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amountReceived}
                disabled={paymentType === "account"}
                onChange={(e) => setAmountReceived(Number(e.target.value))}
              />
            </Field>
            {remainingDue > 0 && (
              <Field label="تاريخ استحقاق المتبقي" required>
                <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
              </Field>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Services table */}
      <Card className="mt-4">
        <CardHeader
          title="الخدمات"
          actions={
            <div className="flex items-center gap-3">
              {anyLineHasCommission && (
                <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={commissionInTotal}
                    onChange={(e) => setCommissionInTotal(e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-slate-600">العمولة داخل السعر</span>
                </label>
              )}
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-4 h-4" /> إضافة خدمة
              </Button>
            </div>
          }
        />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>الخدمة</TH>
                <TH>الصنايعي</TH>
                <TH className="w-20">الكمية</TH>
                <TH className="w-32">السعر</TH>
                {anyLineHasCommission && <TH className="w-28">العمولة</TH>}
                <TH className="w-32 text-end">الإجمالي</TH>
                <TH className="w-10"></TH>
              </TR>
            </THead>
            <TBody>
              {lines.length === 0 ? (
                <TR>
                  <TD colSpan={anyLineHasCommission ? 7 : 6} className="text-center py-6 text-slate-500">
                    لم تتم إضافة خدمات بعد
                  </TD>
                </TR>
              ) : (
                lines.map((l) => {
                  const svc = activeServices.find((s) => s.id === l.serviceId);
                  const lineHasCommission = svc?.hasCommission ?? false;
                  return (
                    <TR key={l.id}>
                      <TD>
                        <Select aria-label="الخدمة" title="الخدمة" value={l.serviceId} onChange={(e) => onServiceChange(l.id, e.target.value)}>
                          {activeServices.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </Select>
                      </TD>
                      <TD>
                        <div className="space-y-1.5 min-w-[200px]">
                          {l.workers.length === 0 ? (
                            <span className="text-slate-400 text-xs">— لم يُسنَد صنايعي —</span>
                          ) : (
                            l.workers.map((w, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <Select aria-label="الصنايعي" title="الصنايعي" value={w.workerId} className="flex-1"
                                  onChange={(e) => setWorkerId(l.id, idx, e.target.value)}>
                                  <option value="" disabled>اختر صنايعي</option>
                                  {dbWorkers.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                  ))}
                                </Select>
                                {lineHasCommission && (
                                  <Input type="number" min={0} step="0.01" placeholder="عمولة" className="w-20"
                                    aria-label="عمولة الصنايعي" title="عمولة الصنايعي"
                                    value={w.commissionAmount || ""}
                                    onChange={(e) => setWorkerCommission(l.id, idx, Number(e.target.value))} />
                                )}
                                <button type="button" onClick={() => removeWorker(l.id, idx)}
                                  className="p-1 text-slate-400 hover:text-rose-600 transition-colors shrink-0" title="إزالة الصنايعي">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                          {dbWorkers.length > 0 && (
                            <button type="button" onClick={() => addWorker(l.id)}
                              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                              <Plus className="w-3 h-3" /> إضافة صنايعي
                            </button>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <Input type="number" min={1} value={l.quantity}
                          onChange={(e) => onQuantityChange(l.id, Number(e.target.value))} />
                      </TD>
                      <TD>
                        <Input type="number" min={0} step="0.01" value={l.price}
                          onChange={(e) => onPriceChange(l.id, Number(e.target.value))} />
                      </TD>
                      {anyLineHasCommission && (
                        <TD className="text-end">
                          {lineHasCommission ? (
                            <span className="text-sm font-medium text-amber-700">
                              {formatCurrency(l.workers.reduce((s, w) => s + (w.commissionAmount ?? 0), 0), settings.currency)}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-sm px-2">—</span>
                          )}
                        </TD>
                      )}
                      <TD className="text-end font-medium">
                        {formatCurrency(l.price * l.quantity, settings.currency)}
                      </TD>
                      <TD>
                        <button onClick={() => removeLine(l.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors" title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      {/* Product add-ons */}
      {dbProducts.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="إضافات (فوّاحة، إلخ…)"
            actions={
              <Button variant="outline" size="sm" onClick={addProductLine}>
                <Plus className="w-4 h-4" /> إضافة ملحق
              </Button>
            }
          />
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>الإضافة</TH>
                  <TH className="w-24">الكمية</TH>
                  <TH className="w-20">الكمية</TH>
                  <TH className="w-32">سعر البيع</TH>
                  <TH className="w-32 text-end">الإجمالي</TH>
                  <TH className="w-10"></TH>
                </TR>
              </THead>
              <TBody>
                {productLines.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-center py-4 text-slate-500 text-sm">
                      اضغط "إضافة ملحق" لإضافة فوّاحة أو أي إضافة أخرى
                    </TD>
                  </TR>
                ) : (
                  productLines.map((l) => {
                    const prod = dbProducts.find((p) => p.id === l.productId);
                    const stockWarning = prod && prod.stockQty < l.quantity;
                    return (
                      <TR key={l.id}>
                        <TD>
                          <Select aria-label="المنتج" title="المنتج" value={l.productId} onChange={(e) => onProductChange(l.id, e.target.value)}>
                            {dbProducts.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </Select>
                        </TD>
                        <TD>
                          <span className={stockWarning ? "text-amber-700 font-bold flex items-center gap-1" : "text-slate-600"}>
                            {stockWarning && <AlertTriangle className="w-3.5 h-3.5" />}
                            {prod?.stockQty ?? "—"}
                          </span>
                        </TD>
                        <TD>
                          <Input type="number" min={1} value={l.quantity}
                            onChange={(e) => updateProductLine(l.id, { quantity: Number(e.target.value) })} />
                        </TD>
                        <TD>
                          <Input type="number" min={0} step="0.01" value={l.price}
                            onChange={(e) => updateProductLine(l.id, { price: Number(e.target.value) })} />
                        </TD>
                        <TD className="text-end font-medium">
                          {formatCurrency(l.price * l.quantity, settings.currency)}
                        </TD>
                        <TD>
                          <button onClick={() => removeProductLine(l.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors" title="حذف">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      )}

      {/* Discount + summary */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardBody className="space-y-4">
            <Field label="كود الخصم">
              {appliedCode ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm font-medium">
                    <Tag className="w-4 h-4" />
                    <span>{appliedCode.code}</span>
                    <span className="text-green-600">
                      ({appliedCode.type === "percent" ? `${appliedCode.value}%` : formatCurrency(appliedCode.value, settings.currency)} خصم)
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={removeCode}>إلغاء</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="أدخل كود الخصم"
                    value={discountCodeInput}
                    onChange={(e) => setDiscountCodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyCode(); }}
                  />
                  <Button variant="outline" onClick={applyCode}>
                    <Check className="w-4 h-4" /> تطبيق
                  </Button>
                </div>
              )}
            </Field>
            {usableSubs.length > 0 && (
              <Field label="اشتراك / باقة العميل" hint={serviceSubtotal === 0 ? "أضف خدمة ليغطّيها الاشتراك" : "الاشتراك يغطّي قيمة الغسيل (الخدمات)"}>
                <Select value={useSubscriptionId} onChange={(e) => setUseSubscriptionId(e.target.value)}>
                  <option value="">— بدون استخدام اشتراك —</option>
                  {usableSubs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.packageName}
                      {s.kind === "count" ? ` (متبقي ${s.remainingWashes ?? 0})` : " (غير محدود)"}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {settings.loyaltyEnabled && availablePoints > 0 && (
              <Field label={`نقاط الولاء (متاح: ${availablePoints} نقطة ≈ ${formatCurrency(availablePoints * pointValue, settings.currency)})`}>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={maxRedeemablePoints}
                    placeholder="0"
                    value={redeemPoints || ""}
                    onChange={(e) => setRedeemPoints(Math.max(0, Math.floor(Number(e.target.value))))}
                  />
                  <Button variant="outline" size="sm" onClick={() => setRedeemPoints(maxRedeemablePoints)} disabled={maxRedeemablePoints === 0}>
                    استخدم الكل
                  </Button>
                  {effectiveRedeem > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setRedeemPoints(0)}>إلغاء</Button>
                  )}
                </div>
                {effectiveRedeem > 0 && (
                  <p className="text-xs text-emerald-600 mt-1">
                    استبدال {effectiveRedeem} نقطة = خصم {formatCurrency(loyaltyDiscount, settings.currency)}
                  </p>
                )}
              </Field>
            )}
            <Field label="ملاحظات">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-2 text-sm">
            {(appliedCode || loyaltyDiscount > 0 || subscriptionDiscount > 0) && (
              <div className="flex items-center justify-between text-slate-500">
                <span>المجموع قبل الخصم</span>
                <span>{formatCurrency(subtotal, settings.currency)}</span>
              </div>
            )}
            {appliedCode && (
              <div className="flex items-center justify-between text-green-700">
                <span>الخصم</span>
                <span>({formatCurrency(discountAmt, settings.currency)})</span>
              </div>
            )}
            {subscriptionDiscount > 0 && (
              <div className="flex items-center justify-between text-green-700">
                <span>تغطية الاشتراك ({activeSubscription?.packageName})</span>
                <span>({formatCurrency(subscriptionDiscount, settings.currency)})</span>
              </div>
            )}
            {loyaltyDiscount > 0 && (
              <div className="flex items-center justify-between text-green-700">
                <span>خصم نقاط الولاء ({effectiveRedeem} نقطة)</span>
                <span>({formatCurrency(loyaltyDiscount, settings.currency)})</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-slate-500">الإجمالي</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(total, settings.currency)}</span>
            </div>
            {remainingDue > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">المتبقي</span>
                <span className="font-semibold text-amber-700">{formatCurrency(remainingDue, settings.currency)}</span>
              </div>
            )}
            {commissionTotal > 0 && (
              <>
                <div className="flex items-center justify-between border-t pt-2 text-blue-700">
                  <span>إجمالي العمولات</span>
                  <span className="font-semibold">{formatCurrency(commissionTotal, settings.currency)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {commissionInTotal ? "العمولات داخل السعر (لا تُضاف)" : "العمولات تُخصم من إيراد المحل"}
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
