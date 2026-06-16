import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useCatalog } from "../store/CatalogContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { useReporting } from "../store/ReportingContext";
import { useToast } from "../components/ui/Toast";
import { todayISO, uid } from "../lib/utils";
import type { InvoiceLine, PaymentMethod, Product, SalesPaymentType, SalesPriceType } from "../types";
import { formatCurrency, PAYMENT_METHOD_LABELS } from "../lib/format";
import { Badge } from "../components/ui/Badge";
import { ConfirmDialog } from "../components/ui/Dialog";
import { DriverDialog } from "../features/drivers/DriverDialog";
import { BarcodeScanInput } from "../features/products/BarcodeScanInput";
import { CustomerFormDialog } from "../features/customers/CustomerFormDialog";
import { useAuth } from "../store/AuthContext";
import { hasPermission } from "../lib/permissions";
import { parseNumericInput } from "../lib/numberInput";
import { findProductByBarcode } from "../lib/barcode";

interface LineDraft {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  expiryDate?: string;
}

const DRAFT_KEY = "sales_invoice_new_draft";

interface DraftState {
  invoiceNumber: string;
  date: string;
  customerId: string;
  driverId: string;
  paymentType: SalesPaymentType;
  paymentMethod: PaymentMethod;
  paymentMethodLabel: string;
  priceType: SalesPriceType;
  paymentDueDate: string;
  discount: number;
  amountReceived: number;
  notes: string;
  lines: LineDraft[];
}

function loadDraft(): DraftState | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as DraftState) : null;
  } catch {
    return null;
  }
}

function saveDraft(state: DraftState) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state));
}

function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

function nextInvoiceNumber(existing: string[]): string {
  const nums = existing
    .map((x) => parseInt(x.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `INV-${max + 1}`;
}

export function SalesInvoiceNewPage() {
  const { products: allProducts, customers: allCustomers, drivers } = useCatalog();
  const { currentUser } = useAuth();
  const canAddCustomer = hasPermission(currentUser, "customers", "add");
  const products = useMemo(() => allProducts.filter((p) => !p.archived), [allProducts]);
  const customers = useMemo(() => allCustomers.filter((c) => !c.archived), [allCustomers]);
  const { salesInvoices, addSalesInvoice, applyCustomerCredit } = useInvoicing();
  const { settings } = useSettings();
  const { customerBalance } = useReporting();
  const navigate = useNavigate();
  const toast = useToast();

  const [draftRestored, setDraftRestored] = useState(() => !!loadDraft());
  const [invoiceNumber, setInvoiceNumber] = useState(() =>
    loadDraft()?.invoiceNumber ?? nextInvoiceNumber(salesInvoices.map((s) => s.invoiceNumber))
  );
  const [date, setDate] = useState(() => loadDraft()?.date ?? todayISO());
  const [customerId, setCustomerId] = useState(() => loadDraft()?.customerId ?? customers[0]?.id ?? "");
  const [driverId, setDriverId] = useState(() => loadDraft()?.driverId ?? "");
  const [paymentType, setPaymentType] = useState<SalesPaymentType>(() => loadDraft()?.paymentType ?? "cash");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => loadDraft()?.paymentMethod ?? "cash");
  const [paymentMethodLabel, setPaymentMethodLabel] = useState(() => loadDraft()?.paymentMethodLabel ?? "");
  const [useCredit, setUseCredit] = useState(false);
  const [priceType, setPriceType] = useState<SalesPriceType>(() => loadDraft()?.priceType ?? "wholesale");
  const [paymentDueDate, setPaymentDueDate] = useState(() => loadDraft()?.paymentDueDate ?? "");
  const [discount, setDiscount] = useState<number>(() => loadDraft()?.discount ?? 0);
  const [amountReceived, setAmountReceived] = useState<number>(() => loadDraft()?.amountReceived ?? 0);
  const [notes, setNotes] = useState(() => loadDraft()?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() => loadDraft()?.lines ?? []);
  const [newDriverOpen, setNewDriverOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [pendingPriceType, setPendingPriceType] = useState<SalesPriceType | null>(null);
  const isDirtyRef = useRef(false);
  useEffect(() => { isDirtyRef.current = lines.length > 0; }, [lines]);
  const blocker = useBlocker(useCallback(() => isDirtyRef.current, []));

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0].id);
  }, [customers, customerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveDraft({ invoiceNumber, date, customerId, driverId, paymentType, paymentMethod, paymentMethodLabel, priceType, paymentDueDate, discount, amountReceived, notes, lines });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [invoiceNumber, date, customerId, driverId, paymentType, paymentMethod, paymentMethodLabel, priceType, paymentDueDate, discount, amountReceived, notes, lines]);

  function handleClearDraft() {
    clearDraft();
    setDraftRestored(false);
    setInvoiceNumber(nextInvoiceNumber(salesInvoices.map((s) => s.invoiceNumber)));
    setDate(todayISO());
    setCustomerId(customers[0]?.id ?? "");
    setDriverId("");
    setPaymentType("cash");
    setPaymentMethod("cash");
    setPaymentMethodLabel("");
    setUseCredit(false);
    setPriceType("wholesale");
    setPaymentDueDate("");
    setAmountReceived(0);
    setNotes("");
    setLines([]);
  }

  const gross = useMemo(
    () => lines.reduce((a, l) => a + (l.quantity || 0) * (l.price || 0), 0),
    [lines]
  );
  const invoiceNet = Math.max(0, gross - (discount || 0));
  // Net available credit = overpayment surplus after netting out any open balances on other invoices
  const creditAvailable = customerId ? Math.max(0, -customerBalance(customerId)) : 0;
  const creditApplied = useCredit ? Math.min(creditAvailable, invoiceNet) : 0;
  const totalEffective = amountReceived + creditApplied;
  const remainingDue = Math.max(0, invoiceNet - totalEffective);
  const customerChange = Math.max(0, totalEffective - invoiceNet);

  useEffect(() => {
    if (paymentType !== "cash") { setAmountReceived(0); return; }
    const cr = useCredit ? Math.min(creditAvailable, invoiceNet) : 0;
    setAmountReceived(Math.max(0, invoiceNet - cr));
  }, [paymentType, invoiceNet, useCredit, customerId, creditAvailable]);

  useEffect(() => {
    if (paymentType === "cash") setPaymentDueDate("");
  }, [paymentType]);

  useEffect(() => {
    setUseCredit(false);
  }, [customerId]);

  const stockWarnings = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l) => {
      if (!l.productId) return;
      map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity);
    });
    const out: { productId: string; requested: number; available: number; name: string; unit: string }[] = [];
    map.forEach((req, pid) => {
      const p = products.find((x) => x.id === pid);
      if (!p) return;
      const isRetailLine = priceType === "retail" && !!p.piecesPerUnit;
      const available = isRetailLine
        ? p.quantity * p.piecesPerUnit! + (p.looseQuantity ?? 0)
        : p.quantity;
      if (req > available) {
        out.push({ productId: pid, requested: req, available, name: p.name, unit: isRetailLine ? (p.retailUnit ?? "قطعة") : p.unit });
      }
    });
    return out;
  }, [lines, products, priceType]);

  function productPrice(product: Product, selectedPriceType = priceType) {
    if (selectedPriceType === "retail" && product.piecesPerUnit) return product.retailPrice;
    return selectedPriceType === "retail" ? product.retailPrice : product.wholesalePrice;
  }

  function addLine(productId?: string) {
    const p = productId ? products.find((x) => x.id === productId) : undefined;
    setLines((l) => [
      ...l,
      {
        id: uid("line"),
        productId: p?.id ?? "",
        quantity: 1,
        price: p ? productPrice(p) : 0,
      },
    ]);
  }

  function handleScan(code: string) {
    const product = findProductByBarcode(products, code);
    if (!product) {
      toast.error("باركود غير معروف", `لا يوجد منتج بالباركود: ${code}`);
      return;
    }
    const wasExisting = lines.some((l) => l.productId === product.id);
    // Functional update keeps rapid consecutive scans of the same item accurate.
    setLines((arr) => {
      const existing = arr.find((l) => l.productId === product.id);
      if (existing) {
        return arr.map((l) =>
          l.id === existing.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...arr,
        { id: uid("line"), productId: product.id, quantity: 1, price: productPrice(product) },
      ];
    });
    toast.success(wasExisting ? "تم تحديث الكمية" : "تمت إضافة المنتج", product.name);
  }

  function changePriceType(nextPriceType: SalesPriceType) {
    if (nextPriceType === priceType) return;
    if (lines.length > 0) {
      setPendingPriceType(nextPriceType);
      return;
    }
    applyPriceType(nextPriceType);
  }

  function applyPriceType(nextPriceType: SalesPriceType) {
    setPriceType(nextPriceType);
    setLines((arr) =>
      arr.map((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (!product) return line;
        return { ...line, price: productPrice(product, nextPriceType) };
      })
    );
  }

  function updateLine(id: string, patch: Partial<LineDraft>) {
    setLines((arr) =>
      arr.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.productId) {
          const p = products.find((x) => x.id === patch.productId);
          if (p) {
            next.price = productPrice(p);
          }
        }
        return next;
      })
    );
  }

  function removeLine(id: string) {
    setLines((arr) => arr.filter((l) => l.id !== id));
  }

  function submit() {
    if (!customerId) {
      toast.error("اختر العميل");
      return;
    }
    if (lines.length === 0) {
      toast.error("أضف بنود الفاتورة");
      return;
    }
    const invalidIdx = lines.findIndex((l) => !l.productId || l.quantity <= 0);
    if (invalidIdx >= 0) {
      toast.error(`السطر ${invalidIdx + 1}: تأكد من اختيار المنتج وإدخال كمية صحيحة`);
      return;
    }
    if (stockWarnings.length > 0) {
      toast.error(
        "الكمية المطلوبة تتجاوز المخزون",
        stockWarnings
          .map((w) => `${w.name}: متاح ${w.available} / مطلوب ${w.requested}`)
          .join(" • ")
      );
      return;
    }
    if (discount < 0 || discount > gross) {
      toast.error("قيمة الخصم غير صحيحة");
      return;
    }
    if (amountReceived < 0) {
      toast.error("المبلغ المستلم غير صحيح");
      return;
    }
    if (paymentType === "cash" && totalEffective <= 0 && invoiceNet > 0) {
      toast.error("أدخل المبلغ المستلم أو استخدم الرصيد الدائن");
      return;
    }
    // Cash with partial payment → auto-convert to account and require due date
    if (paymentType === "cash" && remainingDue > 0) {
      setPaymentType("account");
      if (!paymentDueDate) {
        toast.error("المبلغ أقل من الإجمالي — تم التحويل لآجل، أضف تاريخ الاستحقاق");
        return;
      }
    }
    if ((paymentType === "account" || remainingDue > 0) && !paymentDueDate) {
      toast.error("أدخل تاريخ الاستحقاق");
      return;
    }

    const customer = customers.find((c) => c.id === customerId)!;
    const invLines: InvoiceLine[] = lines.map((l) => {
      const p = products.find((x) => x.id === l.productId)!;
      const isRetailUnit = priceType === "retail" && !!p.piecesPerUnit;
      return {
        id: l.id,
        productId: p.id,
        productName: p.name,
        unit: isRetailUnit ? (p.retailUnit ?? "قطعة") : p.unit,
        quantity: l.quantity,
        price: l.price,
        expiryDate: l.expiryDate,
        subtotal: l.quantity * l.price,
        isRetailUnit: isRetailUnit || undefined,
      };
    });

    // If cash payment was partial it was converted to account above
    const effectivePaymentType: SalesPaymentType = remainingDue > 0 ? "account" : paymentType;
    const effectiveDueDate = (effectivePaymentType === "account" || remainingDue > 0) && paymentDueDate ? paymentDueDate : undefined;

    const actualCashReceived = Math.min(amountReceived, invoiceNet);
    const cashOverpayment = Math.max(0, amountReceived - invoiceNet);

    const inv = addSalesInvoice({
      invoiceNumber,
      date,
      customerId,
      customerName: customer.name,
      driverId: driverId || undefined,
      driverName: driverId ? drivers.find(d => d.id === driverId)?.name : undefined,
      lines: invLines,
      total: invoiceNet,
      discount: discount > 0 ? discount : undefined,
      amountReceived: actualCashReceived,
      overpayment: cashOverpayment > 0 ? cashOverpayment : undefined,
      paymentType: effectivePaymentType,
      paymentMethod,
      paymentMethodLabel: paymentMethod === "other" && paymentMethodLabel.trim() ? paymentMethodLabel.trim() : undefined,
      priceType,
      paymentDueDate: effectiveDueDate,
      notes: notes.trim() || undefined,
    });

    if (creditApplied > 0) {
      applyCustomerCredit(customerId, inv.id, creditApplied);
    }

    isDirtyRef.current = false;
    clearDraft();
    toast.success("تم حفظ الفاتورة", `رقم ${inv.invoiceNumber}`);
    navigate(`/sales/${inv.id}`);
  }

  const customer = customers.find((c) => c.id === customerId);

  return (
    <>
      <PageHeader
        title="فاتورة مبيعات جديدة"
        description="أدخل بنود الفاتورة — يتم خصم الكميات من المخزون تلقائياً عند الحفظ."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/sales")}>
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
            <Button onClick={submit}>
              <Save className="w-4 h-4" />
              حفظ الفاتورة
            </Button>
          </>
        }
      />

      {draftRestored ? (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-4 py-2.5 text-sm flex items-center justify-between">
          <span>تم استعادة مسودة محفوظة تلقائياً.</span>
          <Button size="sm" variant="outline" onClick={handleClearDraft}>
            مسح المسودة
          </Button>
        </div>
      ) : null}

      {stockWarnings.length > 0 ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-lg p-3 text-sm">
          <div className="font-semibold mb-1">⚠ تحذير: الكمية تتجاوز المخزون</div>
          <ul className="list-disc ps-5 space-y-0.5 text-xs">
            {stockWarnings.map((w) => (
              <li key={w.productId}>
                {w.name}: المتاح {w.available} {w.unit} / المطلوب {w.requested} {w.unit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader title="بيانات الفاتورة" />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="رقم الفاتورة" required>
              <Input
                value={invoiceNumber}
                readOnly
                className="bg-gray-100 cursor-not-allowed text-gray-600 font-mono"
              />
            </Field>
            <Field label="التاريخ" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="العميل" required>
              <div className="flex items-center gap-1.5">
                <Select aria-label="العميل" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="flex-1">
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                {canAddCustomer && (
                  <Button size="icon" variant="outline" className="shrink-0"
                    onClick={() => setCustomerDialogOpen(true)} title="إضافة عميل جديد">
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Field>
            <Field label="السائق (اختياري)">
              <div className="flex items-center gap-2">
                <Select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="flex-1">
                  <option value="">— اختر سائقاً —</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
                <Button variant="outline" size="icon" onClick={() => setNewDriverOpen(true)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </Field>
          </div>
          {customer ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>الهاتف: {customer.phone ?? "—"}</span>
              <span>العنوان: {customer.address ?? "—"}</span>
              {(() => {
                const bal = customerBalance(customerId);
                if (bal === 0) return null;
                return (
                  <span className={`font-semibold ${bal > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {bal > 0
                      ? `مديون: ${formatCurrency(bal, settings.currency)}`
                      : `رصيد دائن: ${formatCurrency(-bal, settings.currency)}`}
                  </span>
                );
              })()}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="بنود الفاتورة"
          actions={
            <Button onClick={() => addLine()} size="sm">
              <Plus className="w-3.5 h-3.5" /> إضافة بند
            </Button>
          }
        />
        <CardBody>
          <div className="mb-4">
            <BarcodeScanInput onScan={handleScan} disabled={products.length === 0} />
          </div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-medium text-slate-600">نوع السعر</div>
              </div>
              <div className="grid grid-cols-2 gap-2 md:w-80">
                <PriceTypeOption
                  label="جملة"
                  hint="سعر البيع للتجار"
                  active={priceType === "wholesale"}
                  onClick={() => changePriceType("wholesale")}
                />
                <PriceTypeOption
                  label="تجزئة"
                  hint="سعر البيع للعميل"
                  active={priceType === "retail"}
                  onClick={() => changePriceType("retail")}
                />
              </div>
            </div>
          </div>
          {lines.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              لا توجد بنود — ابدأ بإضافة منتج.
              <div className="mt-3">
                <Button onClick={() => addLine()}>
                  <Plus className="w-4 h-4" /> إضافة بند
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>المنتج</TH>
                  <TH className="w-20 text-center">متاح</TH>
                  <TH className="w-24">الكمية</TH>
                  <TH className="w-28">السعر</TH>
                  <TH className="w-28 text-end">الإجمالي</TH>
                  <TH className="w-10"></TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => {
                  const p = products.find((x) => x.id === l.productId);
                  const isRetailLine = priceType === "retail" && !!p?.piecesPerUnit;
                  const available = isRetailLine
                    ? p!.quantity * p!.piecesPerUnit! + (p!.looseQuantity ?? 0)
                    : (p?.quantity ?? 0);
                  const availUnit = isRetailLine ? (p!.retailUnit ?? "قطعة") : (p?.unit ?? "");
                  const exceeds = l.quantity > available && !!p;
                  return (
                    <TR key={l.id}>
                      <TD>
                        <ProductCombo
                          products={products}
                          value={l.productId}
                          onChange={(pid) => updateLine(l.id, { productId: pid })}
                        />
                      </TD>
                      <TD className="text-center text-xs">
                        {p ? (
                          <Badge tone={available <= p.minStock ? "amber" : "slate"}>
                            {available} {availUnit}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.id, {
                              quantity: Math.max(0, parseNumericInput(e.target.value, l.quantity)),
                            })
                          }
                          className={exceeds ? "border-rose-400" : ""}
                        />
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.price}
                          onChange={(e) =>
                            updateLine(l.id, {
                              price: Math.max(0, parseNumericInput(e.target.value, l.price)),
                            })
                          }
                        />
                      </TD>
                      <TD className="text-end font-medium">
                        {formatCurrency(l.quantity * l.price, settings.currency)}
                      </TD>
                      <TD>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => removeLine(l.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="الدفع" />
          <CardBody className="space-y-3">
            <Field label="طريقة الدفع" required>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={paymentType === "cash"}
                    onChange={() => setPaymentType("cash")}
                  />
                  نقدي
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={paymentType === "account"}
                    onChange={() => setPaymentType("account")}
                  />
                  آجل (حساب)
                </label>
              </div>
            </Field>
            <Field label="وسيلة الدفع">
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPaymentMethod(key)}
                    className={`px-3 h-8 rounded-lg border text-xs font-medium transition-colors ${
                      paymentMethod === key
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {paymentMethod === "other" ? (
                <Input
                  className="mt-2"
                  value={paymentMethodLabel}
                  onChange={(e) => setPaymentMethodLabel(e.target.value)}
                  placeholder="اكتب وسيلة الدفع..."
                />
              ) : null}
            </Field>
            {paymentType === "account" ? (
              <Field label="تاريخ الاستحقاق" required>
                <Input
                  type="date"
                  value={paymentDueDate}
                  onChange={(e) => setPaymentDueDate(e.target.value)}
                  required
                />
              </Field>
            ) : null}
            {creditAvailable > 0 ? (
              <div className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 text-sm ${
                useCredit ? "border-brand-300 bg-brand-50" : "border-emerald-200 bg-emerald-50"
              }`}>
                <div>
                  <span className={`font-medium ${useCredit ? "text-brand-700" : "text-emerald-700"}`}>
                    رصيد دائن متاح: {formatCurrency(creditAvailable, settings.currency)}
                  </span>
                  {useCredit ? (
                    <span className="block text-xs text-brand-600 mt-0.5">
                      سيُخصم {formatCurrency(creditApplied, settings.currency)} من الفاتورة
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={useCredit ? "primary" : "outline"}
                  onClick={() => setUseCredit((v) => !v)}
                >
                  {useCredit ? "إلغاء استخدام الرصيد" : "استخدام الرصيد"}
                </Button>
              </div>
            ) : null}
            <Field label="المبلغ المستلم" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amountReceived}
                onChange={(e) =>
                  setAmountReceived(Math.max(0, parseNumericInput(e.target.value, amountReceived)))
                }
              />
            </Field>
            <Field label="ملاحظات">
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات اختيارية..."
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الملخص" />
          <CardBody className="space-y-2">
            <Row label="إجمالي البنود" value={formatCurrency(gross, settings.currency)} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">خصم</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discount || ""}
                onChange={(e) =>
                  setDiscount(Math.max(0, parseNumericInput(e.target.value, discount)))
                }
                placeholder="0.00"
                className="w-28 h-8 text-sm"
              />
            </div>
            {discount > 0 && (
              <Row label="صافي الفاتورة" value={formatCurrency(invoiceNet, settings.currency)} bold />
            )}
            <Row label="المبلغ المستلم" value={formatCurrency(amountReceived, settings.currency)} />
            {creditApplied > 0 ? (
              <Row label="رصيد دائن مستخدم" value={`- ${formatCurrency(creditApplied, settings.currency)}`} tone="green" />
            ) : null}
            <div className="border-t border-slate-200 pt-2">
              {customerChange > 0 ? (
                <Row
                  label="باقي للعميل"
                  bold
                  value={formatCurrency(customerChange, settings.currency)}
                  tone="green"
                />
              ) : (
                <Row
                  label="المتبقي"
                  bold
                  value={formatCurrency(remainingDue, settings.currency)}
                  tone={remainingDue > 0 ? "amber" : "green"}
                />
              )}
            </div>
            <div className="pt-2">
              <Button onClick={submit} size="lg" className="w-full">
                <Save className="w-4 h-4" /> حفظ الفاتورة
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <DriverDialog
        open={newDriverOpen}
        onClose={() => setNewDriverOpen(false)}
        onSaved={(drv) => setDriverId(drv.id)}
      />
      <CustomerFormDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        onCreated={(created) => setCustomerId(created.id)}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="الخروج بدون حفظ؟"
        message="لديك بنود غير محفوظة. هل تريد الخروج وفقدان التغييرات؟"
        confirmText="خروج"
        variant="danger"
      />
      <ConfirmDialog
        open={pendingPriceType !== null}
        onClose={() => setPendingPriceType(null)}
        onConfirm={() => {
          if (pendingPriceType) applyPriceType(pendingPriceType);
          setPendingPriceType(null);
        }}
        title="تغيير نوع السعر"
        message="تغيير نوع السعر سيحدّث أسعار جميع الأصناف، هل تريد المتابعة؟"
        confirmText="متابعة"
      />
    </>
  );
}

function ProductCombo({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
      <option value="">— اختر منتجاً —</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}{p.category ? ` (${p.category})` : ""} — {p.code}
        </option>
      ))}
    </Select>
  );
}

function PriceTypeOption({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-14 rounded-lg border px-3 text-right transition-colors ${
        active
          ? "border-brand-600 bg-brand-50 text-brand-800 shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-white"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span>
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>
        </span>
        <span
          className={`grid h-5 w-5 place-items-center rounded-full border ${
            active ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"
          }`}
        >
          {active ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
        </span>
      </span>
    </button>
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: "amber" | "green";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "green"
      ? "text-emerald-700"
      : "text-slate-700";

  return (
    <div
      className={`flex items-center justify-between ${
        bold ? "text-lg font-bold" : "text-sm"
      } ${toneClass}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
