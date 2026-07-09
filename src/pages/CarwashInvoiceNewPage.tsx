import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Plus, Save, Trash2, Search, ChevronDown, ChevronUp } from "lucide-react";
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
import { formatCurrency } from "../lib/format";
import { piastresToEgp } from "../lib/money";
import { todayISO, uid, vehicleLabel } from "../lib/utils";
import { hasDb } from "../db/client";
import { listActiveWorkers, type Worker } from "../features/workers/queries";
import { listActiveCarwashProducts, recordProductSale, type Product as CarwashProduct } from "../features/products/carwash-queries";
import { listActiveRawMaterials, recordMaterialConsumption, type RawMaterial } from "../features/materials/queries";
import { listUsableSubscriptions, redeemSubscription, type CustomerSubscription } from "../features/subscriptions/queries";
import { expandServiceMaterials, splitCommissionEvenly } from "../store/_pure";
import { printServiceInvoice } from "../lib/print";
import { CustomerFormDialog } from "../features/customers/CustomerFormDialog";
import { VehicleFormDialog } from "../features/vehicles/VehicleFormDialog";
import type { InvoiceLine, PaymentMethod, SalesPaymentType } from "../types";

interface LineWorkerDraft {
  workerId: string;
  commissionAmount: number;
}

interface ServiceLineDraft {
  id: string;
  serviceId: string;
  quantity: number;
  price: number;
  /** Worker commission for this line — fixed EGP amount entered by the cashier. Never printed. */
  commission: number;
  /** One or more صنايعية sharing this line's commission. Empty = unassigned. */
  workers: LineWorkerDraft[];
}

interface ProductLineDraft {
  id: string;
  productId: string;
  quantity: number;
  price: number; // EGP decimal (from piastresToEgp(product.salePrice))
}

function nextInvoiceNumber(existing: string[], prefix: "INV" | "PRD"): string {
  const nums = existing
    .filter((x) => x.startsWith(prefix))
    .map((x) => parseInt(x.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const currentMax = nums.length ? Math.max(...nums) : 1000;
  const localStorageKey = prefix === "PRD" ? "seq_sales_invoice_prd" : "seq_sales_invoice";
  const storedMax = parseInt(localStorage.getItem(localStorageKey) || "0", 10);
  return `${prefix}-${Math.max(currentMax, storedMax) + 1}`;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "نقدي" },
  { value: "bank", label: "تحويل بنكي" },
  { value: "vodafone", label: "فودافون كاش" },
  { value: "instapay", label: "إنستا باي" },
  { value: "other", label: "أخرى" },
];

export function CarwashInvoiceNewPageContent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queueId = params.get("queue") ?? "";
  const customerParam = params.get("customerId") ?? "";
  const productOnly = params.get("type") === "products";

  const { customers: allCustomers } = useCatalog();
  const { vehicles, washServices, queueTickets, updateQueueTicket, setQueueStatus } = useCarwash();
  const { salesInvoices, addSalesInvoice } = useInvoicing();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();

  const customers = useMemo(() => allCustomers.filter((c) => !c.archived), [allCustomers]);
  const activeServices = useMemo(() => washServices.filter((s) => s.active), [washServices]);

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

  const draftKey = productOnly ? "draft_invoice_products" : "draft_invoice_wash";

  const getDraft = () => {
    try {
      const stored = localStorage.getItem(draftKey);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return null;
  };

  const [invoiceNumber] = useState(() =>
    nextInvoiceNumber(
      salesInvoices.map((s) => s.invoiceNumber),
      productOnly ? "PRD" : "INV"
    )
  );
  const [date] = useState(todayISO());
  const [customerId, setCustomerId] = useState(() => {
    if (ticket?.customerId) return ticket.customerId;
    if (customerParam && customers.some((customer) => customer.id === customerParam)) return customerParam;
    const draft = getDraft();
    if (draft && draft.customerId) return draft.customerId;
    return "";
  });
  const [vehicleId, setVehicleId] = useState(() => {
    if (ticket?.vehicleId) return ticket.vehicleId;
    const draft = getDraft();
    if (draft && draft.vehicleId) return draft.vehicleId;
    return "";
  });
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [lines, setLines] = useState<ServiceLineDraft[]>(() => {
    if (productOnly) return [];
    if (ticket) {
      const selectedIds = ticket.serviceIds?.filter((id) => activeServices.some((s) => s.id === id)) ?? [];
      return selectedIds.map((serviceId) => {
        const service = activeServices.find((s) => s.id === serviceId)!;
        return { id: uid("ln"), serviceId, quantity: 1, price: service.defaultPrice, commission: 0, workers: [] };
      });
    }
    const draft = getDraft();
    if (draft && Array.isArray(draft.lines)) return draft.lines;
    return [];
  });

  const [productLines, setProductLines] = useState<ProductLineDraft[]>(() => {
    const draft = getDraft();
    if (draft && Array.isArray(draft.productLines)) return draft.productLines;
    return [];
  });
  const [invoiceWorkerId, setInvoiceWorkerId] = useState(() => {
    const draft = getDraft();
    if (draft && draft.invoiceWorkerId) return draft.invoiceWorkerId;
    return "";
  });

  useEffect(() => {
    if (!productOnly || dbProducts.length === 0) return;
    const hasStoredDraft = !!localStorage.getItem(draftKey);
    if (hasStoredDraft || productLines.length > 0) return;
    const prod = dbProducts[0];
    setProductLines([{ id: uid("pln"), productId: prod.id, quantity: 1, price: piastresToEgp(prod.salePrice) }]);
  }, [dbProducts, productLines.length, productOnly, draftKey]);

  const [notes, setNotes] = useState(() => {
    const draft = getDraft();
    if (draft && draft.notes) return draft.notes;
    return "";
  });
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [usableSubs, setUsableSubs] = useState<CustomerSubscription[]>([]);
  const [useSubscriptionId, setUseSubscriptionId] = useState("");
  const [paymentType, setPaymentType] = useState<SalesPaymentType>(() => {
    const draft = getDraft();
    if (draft && draft.paymentType) return draft.paymentType;
    return "cash";
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    const draft = getDraft();
    if (draft && draft.paymentMethod) return draft.paymentMethod;
    return "cash";
  });
  const [amountReceived, setAmountReceived] = useState<number>(() => {
    const draft = getDraft();
    if (draft && typeof draft.amountReceived === "number") return draft.amountReceived;
    return 0;
  });
  // Once the cashier types their own "المبلغ المدفوع", stop auto-syncing it to
  // the running total — otherwise adding another line would silently wipe out
  // an overpayment amount they already entered.
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [paymentDueDate, setPaymentDueDate] = useState("");

  useEffect(() => {
    const draft = {
      customerId,
      vehicleId,
      lines,
      productLines,
      invoiceWorkerId,
      notes,
      paymentType,
      paymentMethod,
      amountReceived,
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [
    draftKey,
    customerId,
    vehicleId,
    lines,
    productLines,
    invoiceWorkerId,
    notes,
    paymentType,
    paymentMethod,
    amountReceived,
  ]);

  // Clean up draft lines referencing deleted/archived services or products (e.g., after database reset)
  useEffect(() => {
    if (activeServices.length > 0 && lines.length > 0) {
      const validLines = lines.filter((l) => activeServices.some((s) => s.id === l.serviceId));
      if (validLines.length !== lines.length) {
        setLines(validLines);
      }
    } else if (activeServices.length === 0 && lines.length > 0) {
      setLines([]);
    }
  }, [activeServices, lines.length]);

  useEffect(() => {
    if (dbProducts.length > 0 && productLines.length > 0) {
      const validLines = productLines.filter((l) => dbProducts.some((p) => p.id === l.productId));
      if (validLines.length !== productLines.length) {
        setProductLines(validLines);
      }
    } else if (dbProducts.length === 0 && productLines.length > 0) {
      setProductLines([]);
    }
  }, [dbProducts, productLines.length]);

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
  const afterCode = subtotal;

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
  // Lines whose service participates in worker commission (تدخل في العمولة).
  const hasCommissionLines = useMemo(
    () => lines.some((line) => activeServices.find((item) => item.id === line.serviceId)?.hasCommission),
    [lines, activeServices]
  );
  const commissionTotal = useMemo(
    () => lines.reduce((sum, line) => {
      const service = activeServices.find((item) => item.id === line.serviceId);
      return sum + lineCommission(service, line.commission);
    }, 0),
    [lines, activeServices]
  );
  const remainingDue = Math.max(0, total - amountReceived);
  const changeDue = Math.max(0, amountReceived - total);

  // Default "المبلغ المدفوع" to the running total (exact payment, no extra
  // clicks) until the cashier manually edits it to record an overpayment.
  useEffect(() => {
    if (!receivedTouched) setAmountReceived(total);
  }, [total, receivedTouched]);

  // Service line CRUD ─ commission is a fixed EGP amount typed by the cashier
  // per line (internal only — never shown to the customer or printed), split
  // evenly across the line's assigned صنايعية (each share editable).
  function lineCommission(svc: (typeof activeServices)[number] | undefined, amount: number): number {
    return svc?.hasCommission && amount > 0 ? amount : 0;
  }

  function resplit(workers: LineWorkerDraft[], svc: (typeof activeServices)[number] | undefined, amount: number): LineWorkerDraft[] {
    const shares = splitCommissionEvenly(lineCommission(svc, amount), workers.length);
    return workers.map((w, i) => ({ ...w, commissionAmount: shares[i] ?? 0 }));
  }

  function addLine() {
    const svc = activeServices[0];
    if (!svc) { toast.error("لا توجد خدمات مفعّلة — أضف خدمات أولاً"); return; }
    setLines((l) => [...l, { id: uid("ln"), serviceId: svc.id, quantity: 1, price: svc.defaultPrice, commission: 0, workers: [] }]);
  }

  function removeLine(id: string) {
    setLines((l) => l.filter((row) => row.id !== id));
  }

  function onServiceChange(id: string, serviceId: string) {
    const svc = activeServices.find((s) => s.id === serviceId);
    const price = svc?.defaultPrice ?? 0;
    // Switching the service resets the commission — the cashier types the new amount.
    setLines((l) => l.map((row) => (row.id === id ? { ...row, serviceId, price, commission: 0, workers: resplit(row.workers, svc, 0) } : row)));
  }

  function onPriceChange(lineId: string, newPrice: number) {
    setLines((l) => l.map((row) => (row.id === lineId ? { ...row, price: newPrice } : row)));
  }

  function onQuantityChange(lineId: string, newQty: number) {
    setLines((l) => l.map((row) => (row.id === lineId ? { ...row, quantity: newQty } : row)));
  }

  function onCommissionChange(lineId: string, amount: number) {
    setLines((l) => l.map((row) => {
      if (row.id !== lineId) return row;
      const svc = activeServices.find((s) => s.id === row.serviceId);
      return { ...row, commission: amount, workers: resplit(row.workers, svc, amount) };
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
      return { ...row, workers: resplit(workers, svc, row.commission) };
    }));
  }

  function removeWorker(lineId: string, index: number) {
    setLines((l) => l.map((row) => {
      if (row.id !== lineId) return row;
      const svc = activeServices.find((s) => s.id === row.serviceId);
      const workers = row.workers.filter((_, i) => i !== index);
      return { ...row, workers: resplit(workers, svc, row.commission) };
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

  async function submit() {
    const customer = customers.find((c) => c.id === customerId);
    if (lines.length === 0 && productLines.length === 0) { toast.error(productOnly ? "أضف منتجاً واحداً على الأقل" : "أضف خدمة أو إضافة واحدة على الأقل"); return; }
    if (!productOnly && lines.some((l) => !l.serviceId || l.quantity <= 0)) { toast.error("تحقق من بنود الخدمات"); return; }
    if (productLines.some((l) => !l.productId || l.quantity <= 0)) { toast.error("تحقق من بنود الإضافات"); return; }
    // الصنايعي is mandatory on every wash-service invoice so every job is
    // attributed to whoever performed it, commission or not.
    if (!productOnly && lines.length > 0 && !invoiceWorkerId) {
      toast.error("اختر الصنايعي", "يجب تحديد الصنايعي الذي قام بالخدمة قبل تأكيد الفاتورة");
      return;
    }
    // No account/credit workflow in this build — the invoice must be paid in
    // full (or overpaid) before it can be confirmed.
    if (remainingDue > 0) {
      toast.error("المبلغ المدفوع أقل من المطلوب", `متبقي ${formatCurrency(remainingDue, settings.currency)} — أكمل المبلغ قبل التأكيد`);
      return;
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
      const commission = lineCommission(svc, l.commission);
      const assigned = invoiceWorkerId ? [{
        workerId: invoiceWorkerId,
        workerName: dbWorkers.find((d) => d.id === invoiceWorkerId)?.name,
        commissionAmount: commission,
      }] : [];
      return {
        id: uid("sline"),
        productId: "",
        productName: svc.name,
        unit: "خدمة",
        quantity: 1,
        price: l.price,
        subtotal: l.price,
        kind: "service",
        serviceId: svc.id,
        // Legacy single-worker mirror (first assigned) for back-compat display.
        employeeId: assigned[0]?.workerId,
        employeeName: assigned[0]?.workerName,
        workers: assigned.length > 0 ? assigned : undefined,
        commissionAmount: commission > 0 ? commission : undefined,
        commissionInTotal: commission > 0 ? false : undefined,
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
    const inv = addSalesInvoice({
      invoiceNumber,
      date,
      customerId: customer?.id ?? "",
      customerName: customer?.name ?? "زائر",
      lines: invLines,
      total,
      // Cash actually kept for this invoice is capped at the total — any extra
      // the customer handed over is change given back immediately (see
      // "الباقي للعميل" above), not a carried customer credit (that's what the
      // separate `overpayment` field means elsewhere in the app).
      amountReceived: Math.min(amountReceived, total),
      // Keep a record of what the customer actually handed over, so the
      // receipt/invoice can still show "دفع كام" and the change given back —
      // otherwise that number is lost the moment the invoice is saved.
      cashTendered: changeDue > 0 ? amountReceived : undefined,
      paymentType: "cash",
      paymentMethod: "cash",
      priceType: "retail",
      notes: notes.trim() || undefined,
      createdByUserId: currentUser?.id,
      invoiceKind: productOnly ? "product" : "service",
      vehicleId: productOnly ? undefined : vehicle?.id,
      vehicleLabel: productOnly ? undefined : vehicle ? vehicleLabel(vehicle) : undefined,
      queueId: productOnly ? undefined : ticket?.id,
      finalizedAt: new Date().toISOString(),
      commissionInTotal: commissionTotal > 0 ? false : undefined,
      commissionTotal: commissionTotal > 0 ? commissionTotal : undefined,
      loyaltyPointsRedeemed: effectiveRedeem > 0 ? effectiveRedeem : undefined,
    });

    if (!productOnly && ticket) {
      updateQueueTicket(ticket.id, { invoiceId: inv.id });
      setQueueStatus(ticket.id, "done");
    }

    const issuedNum = parseInt(inv.invoiceNumber.replace(/\D/g, ""), 10);
    if (!Number.isNaN(issuedNum)) {
      const localStorageKey = productOnly ? "seq_sales_invoice_prd" : "seq_sales_invoice";
      const storedMax = parseInt(localStorage.getItem(localStorageKey) || "0", 10);
      localStorage.setItem(localStorageKey, Math.max(storedMax, issuedNum).toString());
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
    if (!productOnly && hasDb()) {
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
    if (!productOnly && hasDb() && activeSubscription && customer) {
      try {
        await redeemSubscription({
          redemptionId: uid("redm"),
          subscriptionId: activeSubscription.id,
          orderId: inv.id,
          customerId: customer.id,
          washesUsed: 1,
          businessDate: todayISO(),
          createdAt: new Date().toISOString(),
        });
      } catch {
        toast.error("تعذّر خصم الاشتراك — راجع رصيد الباقة");
      }
    }

    // Print 80mm invoice
    const printResult = printServiceInvoice({
      invoice: inv,
      businessName: settings.companyName ?? "Top Gear",
      currency: settings.currency,
    });
    if (!printResult.ok) {
      toast.error("تعذر فتح الطباعة", "تأكد من إعدادات الطابعة وحاول مرة أخرى");
    }

    localStorage.removeItem(draftKey);
    toast.success(productOnly ? "تم تأكيد فاتورة المنتجات" : "تم تأكيد فاتورة الغسيل", `رقم ${inv.invoiceNumber}`);
    navigate(`/sales/${inv.id}`);
  }

  return (
    <>
      <PageHeader
        title={productOnly ? "فاتورة منتجات جديدة" : "فاتورة غسيل جديدة"}
        description={productOnly ? "بيع منتجات وإكسسوارات منفصلة عن تذاكر الغسيل." : "أدخل الخدمات والصنايعي والإضافات والخصم — تُؤكَّد الفاتورة وتُطبع فور الحفظ."}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowRight className="w-4 h-4" /> رجوع
            </Button>
            <Button onClick={submit}>
              <Save className="w-4 h-4" /> {productOnly ? "تأكيد فاتورة المنتجات" : "تأكيد وطباعة"}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4">
        {/* Basic data */}
        <Card>
          <CardHeader title="البيانات الأساسية" />
          <CardBody className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="رقم الفاتورة">
              <Input value={invoiceNumber} readOnly className="bg-slate-100 font-mono" />
            </Field>
            <Field label="التاريخ">
              <Input type="date" value={date} readOnly className="bg-slate-100 text-slate-600" />
            </Field>
            <Field label="العميل">
              <div className="flex gap-2">
                <Select
                  title="العميل"
                  value={customerId}
                  onChange={(e) => { setCustomerId(e.target.value); setVehicleId(""); }}
                  className="flex-1"
                >
                  <option value="">زائر / بدون عميل</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <Button type="button" variant="outline" size="icon" title="إضافة عميل جديد" onClick={() => setCustomerDialogOpen(true)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </Field>
            {!productOnly ? (
              <>
                <Field label="المركبة" hint={customerVehicles.length === 0 ? "لا توجد مركبات لهذا العميل" : undefined}>
                  <div className="flex gap-2">
                    <Select title="المركبة" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="flex-1">
                      <option value="">— بدون مركبة —</option>
                      {customerVehicles.map((v) => (
                        <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title={customerId ? "إضافة مركبة جديدة" : "اختر العميل أولاً"}
                      disabled={!customerId}
                      onClick={() => setVehicleDialogOpen(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </Field>
                <Field
                  label="الصنايعي"
                  required
                  hint={!invoiceWorkerId ? "مطلوب — حدد من قام بالخدمة" : undefined}
                >
                  <Select value={invoiceWorkerId} onChange={(e) => setInvoiceWorkerId(e.target.value)}>
                    <option value="" disabled>— اختر صنايعي —</option>
                    {dbWorkers.map((worker) => (
                      <option key={worker.id} value={worker.id}>{worker.name}</option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : null}
          </CardBody>
        </Card>

        {/* Payment */}
        <Card className="hidden">
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
            <Field label="المبلغ المدفوع">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amountReceived}
                disabled={paymentType === "account"}
                onChange={(e) => setAmountReceived(Number(e.target.value))}
              />
            </Field>
            {false && remainingDue > 0 && (
              <Field label="تاريخ استحقاق المتبقي" required>
                <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
              </Field>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Services table */}
      {!productOnly ? (
        <Card className="mt-4">
          <CardHeader
            title="الخدمات"
            actions={
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-4 h-4" /> إضافة خدمة
                </Button>
              </div>
            }
          />
          <CardBody className="p-0">
            <Table overflowVisible>
              <THead>
                <TR>
                  <TH>الخدمة</TH>
                  <TH className="w-32">السعر</TH>
                  {hasCommissionLines && <TH className="w-36">عمولة الصنايعي</TH>}
                  <TH className="w-32 text-end">الإجمالي</TH>
                  <TH className="w-10"></TH>
                </TR>
              </THead>
              <TBody>
                {lines.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-center py-6 text-slate-500">
                      لم تتم إضافة خدمات بعد
                    </TD>
                  </TR>
                ) : (
                  lines.map((l) => {
                    const svc = activeServices.find((s) => s.id === l.serviceId);
                    const lineHasCommission = svc?.hasCommission ?? false;
                    return (
                      <TR key={l.id}>
                        <TD className="relative overflow-visible">
                          <div className="relative w-full">
                            <button
                              type="button"
                              onClick={() => {
                                if (openDropdownId === l.id) {
                                  setOpenDropdownId(null);
                                } else {
                                  setOpenDropdownId(l.id);
                                  setSearchQuery("");
                                }
                              }}
                              className="flex items-center justify-between w-full px-3 py-2 text-sm text-right bg-white border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-all shadow-sm min-w-[220px]"
                            >
                              <span className="truncate font-medium">
                                {svc ? svc.name : "اختر خدمة..."}
                              </span>
                              {openDropdownId === l.id ? (
                                <ChevronUp className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                              )}
                            </button>

                            {openDropdownId === l.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenDropdownId(null)}
                                />
                                <div className="absolute right-0 top-full mt-1.5 w-full min-w-[320px] bg-slate-50 border border-slate-300 rounded-xl shadow-xl z-20 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                                  <div className="flex items-center px-3 py-2 border-b border-slate-200 bg-white">
                                    <Search className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
                                    <input
                                      type="text"
                                      value={searchQuery}
                                      onChange={(e) => setSearchQuery(e.target.value)}
                                      placeholder="بحث عن خدمة..."
                                      className="w-full bg-transparent border-0 p-0 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0 focus:border-0"
                                      autoFocus
                                    />
                                  </div>
                                  <div className="max-h-56 overflow-y-auto p-2 space-y-1.5 bg-slate-50">
                                    {activeServices
                                      .filter((s) =>
                                        s.name.toLowerCase().includes(searchQuery.toLowerCase())
                                      )
                                      .map((s) => (
                                        <button
                                          key={s.id}
                                          type="button"
                                          onClick={() => {
                                            onServiceChange(l.id, s.id);
                                            setOpenDropdownId(null);
                                          }}
                                          className={`flex items-center justify-between w-full px-3 py-2 text-right text-sm rounded-lg border transition-all shadow-sm ${
                                            l.serviceId === s.id
                                              ? "bg-slate-200 border-slate-300 font-semibold text-slate-900"
                                              : "bg-white border-slate-200/80 text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 hover:border-slate-300 active:bg-slate-200"
                                          }`}
                                        >
                                          <span className="truncate">{s.name}</span>
                                        </button>
                                      ))}
                                    {activeServices.filter((s) =>
                                      s.name.toLowerCase().includes(searchQuery.toLowerCase())
                                    ).length === 0 && (
                                      <div className="text-center py-4 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg">
                                        لا توجد خدمات مطابقة للبحث
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </TD>
                        <TD className="hidden">
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
                        <TD className="hidden">
                          <Input type="number" min={1} value={l.quantity}
                            onChange={(e) => onQuantityChange(l.id, Number(e.target.value))} />
                        </TD>
                        <TD>
                          <Input type="number" min={0} step="0.01" value={l.price}
                            onChange={(e) => onPriceChange(l.id, Number(e.target.value))} />
                        </TD>
                        {hasCommissionLines && (
                          <TD>
                            {lineHasCommission ? (
                              <Input type="number" min={0} step="0.01" placeholder="0"
                                aria-label="عمولة الصنايعي" title="مبلغ عمولة الصنايعي — لا يظهر للعميل ولا يُطبع"
                                value={l.commission || ""}
                                onChange={(e) => onCommissionChange(l.id, Number(e.target.value))} />
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
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
      ) : null}

      {/* Product add-ons */}
      {dbProducts.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title={productOnly ? "بنود فاتورة المنتجات" : "المنتجات"}
            actions={
              <Button variant="outline" size="sm" onClick={addProductLine}>
                <Plus className="w-4 h-4" /> إضافة منتج
              </Button>
            }
          />
          <CardBody className="p-0 overflow-visible">
            <Table overflowVisible>
              <THead>
                <TR>
                  <TH>الإضافة</TH>
                  <TH className="w-32">الكمية المتاحة</TH>
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
                      اضغط "إضافة منتج" لإضافة بند جديد
                    </TD>
                  </TR>
                ) : (
                  productLines.map((l) => {
                    const prod = dbProducts.find((p) => p.id === l.productId);
                    const stockWarning = prod && prod.stockQty < l.quantity;
                    return (
                      <TR key={l.id}>
                        <TD className="relative overflow-visible">
                          <div className="relative w-full">
                            <button
                              type="button"
                              onClick={() => {
                                if (openDropdownId === l.id) {
                                  setOpenDropdownId(null);
                                } else {
                                  setOpenDropdownId(l.id);
                                  setSearchQuery("");
                                }
                              }}
                              className="flex items-center justify-between w-full px-3 py-2 text-sm text-right bg-white border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-all shadow-sm min-w-[280px]"
                            >
                              <span className="truncate font-medium">
                                {prod ? prod.name : "اختر منتج..."}
                              </span>
                              {openDropdownId === l.id ? (
                                <ChevronUp className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                              )}
                            </button>

                            {openDropdownId === l.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenDropdownId(null)}
                                />
                                <div className="absolute right-0 top-full mt-1.5 w-full min-w-[320px] bg-slate-50 border border-slate-300 rounded-xl shadow-xl z-20 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                                  <div className="flex items-center px-3 py-2 border-b border-slate-200 bg-white">
                                    <Search className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
                                    <input
                                      type="text"
                                      value={searchQuery}
                                      onChange={(e) => setSearchQuery(e.target.value)}
                                      placeholder="بحث عن منتج..."
                                      className="w-full bg-transparent border-0 p-0 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0 focus:border-0"
                                      autoFocus
                                    />
                                  </div>
                                  <div className="max-h-56 overflow-y-auto p-2 space-y-1.5 bg-slate-50">
                                    {dbProducts
                                      .filter((p) =>
                                        p.name.toLowerCase().includes(searchQuery.toLowerCase())
                                      )
                                      .map((p) => {
                                        const isOutOfStock = p.stockQty <= 0;
                                        return (
                                          <button
                                            key={p.id}
                                            type="button"
                                            disabled={isOutOfStock}
                                            onClick={() => {
                                              onProductChange(l.id, p.id);
                                              setOpenDropdownId(null);
                                            }}
                                            className={`flex items-center justify-between w-full px-3 py-2 text-right text-sm rounded-lg border transition-all shadow-sm ${
                                              isOutOfStock
                                                ? "text-slate-400 bg-slate-100 border-slate-200 cursor-not-allowed"
                                                : l.productId === p.id
                                                ? "bg-slate-200 border-slate-300 font-semibold text-slate-900"
                                                : "bg-white border-slate-200/80 text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 hover:border-slate-300 active:bg-slate-200"
                                            }`}
                                          >
                                            <span className="truncate">{p.name}</span>
                                            <span className={`text-xs mr-2 shrink-0 ${isOutOfStock ? "text-rose-500 font-semibold" : "text-slate-400"}`}>
                                              {isOutOfStock ? "نفد" : `المتاح: ${p.stockQty}`}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    {dbProducts.filter((p) =>
                                      p.name.toLowerCase().includes(searchQuery.toLowerCase())
                                    ).length === 0 && (
                                      <div className="text-center py-4 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg">
                                        لا توجد منتجات مطابقة للبحث
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </TD>
                        <TD>
                          <span className={stockWarning ? "text-rose-600 font-bold flex items-center gap-1 text-sm" : "text-slate-600 font-medium text-sm"}>
                            {stockWarning && <AlertTriangle className="w-4 h-4 shrink-0" />}
                            {prod?.stockQty ?? 0}
                          </span>
                        </TD>
                        <TD>
                          <Input type="number" min={1} value={l.quantity}
                            onChange={(e) => updateProductLine(l.id, { quantity: Number(e.target.value) })} />
                        </TD>
                        <TD className="text-slate-700 font-medium py-3">
                          {formatCurrency(l.price, settings.currency)}
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
        <Card>
          <CardBody className="space-y-2 text-sm">
            {(loyaltyDiscount > 0 || subscriptionDiscount > 0) && (
              <div className="flex items-center justify-between text-slate-500">
                <span>المجموع قبل الخصم</span>
                <span>{formatCurrency(subtotal, settings.currency)}</span>
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
            <div className="rounded-lg border border-slate-200 overflow-hidden mt-1">
              <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50">
                <span className="text-slate-500">الإجمالي</span>
                <span className="text-lg font-bold text-slate-900">{formatCurrency(total, settings.currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-slate-100">
                <span className="text-slate-500 shrink-0">المبلغ المدفوع</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">{settings.currency}</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amountReceived}
                    onChange={(e) => {
                      setReceivedTouched(true);
                      setAmountReceived(Number(e.target.value));
                    }}
                    className="w-28 text-end font-semibold"
                  />
                </div>
              </div>
              {changeDue > 0 && (
                <div className="flex items-center justify-between px-3 py-2.5 border-t border-emerald-100 bg-emerald-50">
                  <span className="font-medium text-emerald-700">الباقي للعميل</span>
                  <span className="text-lg font-bold text-emerald-700">{formatCurrency(changeDue, settings.currency)}</span>
                </div>
              )}
              {remainingDue > 0 && (
                <div className="flex items-center justify-between px-3 py-2.5 border-t border-amber-100 bg-amber-50">
                  <span className="font-medium text-amber-700">المتبقي</span>
                  <span className="text-lg font-bold text-amber-700">{formatCurrency(remainingDue, settings.currency)}</span>
                </div>
              )}
            </div>
            {commissionTotal > 0 && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 space-y-1 text-xs">
                <div className="flex items-center justify-between text-rose-700">
                  <span>عمولة الصنايعي (تُخصم من الخزنة)</span>
                  <span className="font-semibold">{formatCurrency(commissionTotal, settings.currency)}</span>
                </div>
                <div className="flex items-center justify-between text-emerald-700">
                  <span>صافي المحل</span>
                  <span className="font-semibold">{formatCurrency(Math.max(0, total - commissionTotal), settings.currency)}</span>
                </div>
                <div className="text-slate-400">داخلي فقط — لا يظهر في الفاتورة المطبوعة</div>
              </div>
            )}
            <Button onClick={submit} className="w-full justify-center" size="lg">
              <Save className="w-4 h-4" /> {productOnly ? "تأكيد فاتورة المنتجات" : "تأكيد وطباعة"}
            </Button>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardBody className="space-y-4">
            {!productOnly && usableSubs.length > 0 && (
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
      </div>

      <CustomerFormDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        onCreated={(customer) => { setCustomerId(customer.id); setVehicleId(""); }}
      />
      <VehicleFormDialog
        open={vehicleDialogOpen}
        onClose={() => setVehicleDialogOpen(false)}
        customerId={customerId}
        customers={customers}
        onCreated={(vehicle) => setVehicleId(vehicle.id)}
      />
    </>
  );
}

export function CarwashInvoiceNewPage() {
  const [params] = useSearchParams();
  const type = params.get("type") || "wash";
  const queue = params.get("queue") || "";
  const customerId = params.get("customerId") || "";
  const componentKey = `${type}-${queue}-${customerId}`;
  return <CarwashInvoiceNewPageContent key={componentKey} />;
}
