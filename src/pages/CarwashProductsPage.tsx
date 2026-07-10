import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Package, Pencil, Plus, RefreshCw, TrendingUp } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Field, Input } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { useApp } from "../store/AppContext";
import { hasPermissionKey } from "../lib/permissions";
import { piastresToEgp, egpToPiastres } from "../lib/money";
import { todayISO, uid } from "../lib/utils";
import { hasDb } from "../db/client";
import {
  listAllCarwashProducts,
  createCarwashProduct,
  updateCarwashProduct,
  recordRestock,
  getProductProfits,
  type Product,
  type ProductProfit,
} from "../features/products/carwash-queries";

const CURRENCY = "ج.م";

function fmtEgp(piastres: number): string {
  return `${piastresToEgp(piastres).toFixed(2)} ${CURRENCY}`;
}

// ── Product form dialog ──────────────────────────────────────────────────────

interface ProductFormProps {
  open: boolean;
  initial?: Product | null;
  onSave: (data: {
    name: string;
    salePrice: number;
    purchasePrice: number;
    lowStockThreshold: number;
    stockQty?: number;
  }) => void;
  onClose: () => void;
}

function ProductForm({ open, initial, onSave, onClose }: ProductFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [salePrice, setSalePrice] = useState(initial ? piastresToEgp(initial.salePrice).toString() : "");
  const [purchasePrice, setPurchasePrice] = useState(initial ? piastresToEgp(initial.purchasePrice).toString() : "");
  const [threshold, setThreshold] = useState(initial?.lowStockThreshold?.toString() ?? "5");
  const [stockQty, setStockQty] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setSalePrice(initial ? piastresToEgp(initial.salePrice).toString() : "");
      setPurchasePrice(initial ? piastresToEgp(initial.purchasePrice).toString() : "");
      setThreshold(initial?.lowStockThreshold?.toString() ?? "5");
      setStockQty("");
    }
  }, [open, initial]);

  function handleSave() {
    if (!name.trim()) return;
    const sp = parseFloat(salePrice);
    const pp = parseFloat(purchasePrice);
    const th = parseInt(threshold || "5", 10);
    const sq = parseInt(stockQty || "0", 10);

    if (!Number.isFinite(sp) || sp < 0) return;
    if (!Number.isFinite(pp) || pp < 0) return;

    onSave({
      name: name.trim(),
      salePrice: egpToPiastres(sp),
      purchasePrice: egpToPiastres(pp),
      lowStockThreshold: Number.isFinite(th) && th >= 0 ? th : 5,
      stockQty: sq >= 0 ? sq : 0,
    });
  }

  const isSaveDisabled =
    !name.trim() ||
    !salePrice ||
    parseFloat(salePrice) < 0 ||
    isNaN(parseFloat(salePrice)) ||
    !purchasePrice ||
    parseFloat(purchasePrice) < 0 ||
    isNaN(parseFloat(purchasePrice));

  return (
    <Dialog open={open} onClose={onClose} title={initial ? "تعديل منتج" : "منتج جديد"}>
      <div className="space-y-4">
        <Field label="اسم المنتج" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: فوّاحة" />
        </Field>
        <Field label={`سعر البيع (${CURRENCY})`} required>
          <Input type="number" min={0} step="0.5" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
        </Field>
        <Field label={`تكلفة الوحدة (${CURRENCY})`} required>
          <Input type="number" min={0} step="0.5" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
        </Field>
        {!initial && (
          <Field label="الكمية">
            <Input type="number" min={0} step="1" value={stockQty} onChange={(e) => setStockQty(e.target.value)} placeholder="0" />
          </Field>
        )}
        <Field label="حد التنبيه (كمية)" hint="ينبّه عند الوصول لهذه الكمية">
          <Input type="number" min={0} step="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={isSaveDisabled}>حفظ</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ── Restock dialog ───────────────────────────────────────────────────────────

interface RestockProps {
  open: boolean;
  product: Product | null;
  onSave: (qty: number, unitPrice: number) => void;
  onClose: () => void;
}

function RestockDialog({ open, product, onSave, onClose }: RestockProps) {
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (open && product) {
      setQty("1");
      setPrice(piastresToEgp(product.purchasePrice).toString());
    }
  }, [open, product]);

  function handleSave() {
    const q = parseInt(qty, 10);
    const p = parseFloat(price || "0");
    if (!Number.isFinite(q) || q <= 0) return;
    onSave(q, egpToPiastres(p));
  }

  return (
    <Dialog open={open} onClose={onClose} title={`إضافة كمية — ${product?.name ?? ""}`}>
      <div className="space-y-4">
        <Field label="الكمية المضافة" required>
          <Input type="number" min={1} step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label={`تكلفة الوحدة (${CURRENCY})`}>
          <Input type="number" min={0} step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={parseInt(qty, 10) <= 0}>إضافة الكمية</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function CarwashProductsPage() {
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const { syncCarwashProducts } = useApp();
  const toast = useToast();
  const branchId = settings.currentBranchId || "branch-main";
  const canManage = hasPermissionKey(currentUser, "products.manage");

  const [products, setProducts] = useState<Product[]>([]);
  const [profits, setProfits] = useState<ProductProfit[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [restocking, setRestocking] = useState<Product | null>(null);

  const load = useCallback(async () => {
    if (!hasDb()) { setLoading(false); return; }
    try {
      await syncCarwashProducts();
      const [prods, profs] = await Promise.all([listAllCarwashProducts(), getProductProfits()]);
      setProducts(prods);
      setProfits(profs);
    } finally {
      setLoading(false);
    }
  }, [syncCarwashProducts]);

  useEffect(() => { load(); }, [load]);

  const profitMap = useMemo(
    () => new Map(profits.map((p) => [p.productId, p])),
    [profits]
  );

  const lowStockCount = useMemo(
    () => products.filter((p) => p.active && p.stockQty <= p.lowStockThreshold).length,
    [products]
  );

  async function handleSaveProduct(data: {
    name: string;
    salePrice: number;
    purchasePrice: number;
    lowStockThreshold: number;
    stockQty?: number;
  }) {
    if (!hasDb()) { toast.error("قاعدة البيانات غير متاحة"); return; }
    try {
      if (editing) {
        await updateCarwashProduct(editing.id, {
          name: data.name,
          salePrice: data.salePrice,
          purchasePrice: data.purchasePrice,
          lowStockThreshold: data.lowStockThreshold,
        });
        toast.success("تم تحديث الإضافة");
      } else {
        await createCarwashProduct({
          id: uid("prod"),
          active: true,
          name: data.name,
          salePrice: data.salePrice,
          purchasePrice: data.purchasePrice,
          lowStockThreshold: data.lowStockThreshold,
          stockQty: data.stockQty,
          branchId,
          businessDate: todayISO(),
          createdBy: currentUser?.id,
          createdAt: new Date().toISOString(),
        });
        toast.success("تمت إضافة الإضافة");
      }
      setFormOpen(false);
      setEditing(null);
      load();
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    }
  }

  async function handleRestock(qty: number, unitPrice: number) {
    if (!restocking || !hasDb()) return;
    try {
      await recordRestock({
        movementId: uid("mov"),
        productId: restocking.id,
        qty,
        unitPrice,
        branchId,
        businessDate: todayISO(),
        createdBy: currentUser?.id,
        createdAt: new Date().toISOString(),
      });
      toast.success(`تم إضافة ${qty} وحدة لـ ${restocking.name}`);
      setRestocking(null);
      load();
    } catch {
      toast.error("حدث خطأ أثناء التحديث");
    }
  }

  async function handleToggleActive(p: Product) {
    if (!hasDb()) return;
    try {
      await updateCarwashProduct(p.id, { active: !p.active });
      toast.success(p.active ? "تم تعطيل الإضافة" : "تم تفعيل الإضافة");
      load();
    } catch {
      toast.error("حدث خطأ");
    }
  }

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products]);
  const inactiveProducts = useMemo(() => products.filter((p) => !p.active), [products]);

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-slate-500">جاري التحميل…</div>;
  }

  return (
    <>
      <PageHeader
        title="المنتجات"
        description="المنتجات التي تُباع مع الغسيل، مع متابعة الكمية والربح."
        actions={
          canManage ? (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4" /> منتج جديد
            </Button>
          ) : null
        }
      />

      {lowStockCount > 0 && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{lowStockCount} إضافة وصلت لحد التنبيه — يلزم زيادة الكمية</span>
        </div>
      )}

      {/* Active products */}
      <Card>
        <CardHeader title="المنتجات الفعّالة" />
        <CardBody className="p-0">
          {activeProducts.length === 0 ? (
            <EmptyState
              icon={<Package className="w-8 h-8" />}
              title="لا توجد إضافات بعد"
              description="أضف فوّاحة أو معطراً أو أي إضافة تريد بيعها مع الغسيل."
              action={canManage ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="w-4 h-4" /> إضافة جديدة</Button> : undefined}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>المنتج</TH>
                  <TH className="w-24">الكمية</TH>
                  <TH className="w-32">سعر البيع</TH>
                  <TH className="w-32">التكلفة</TH>
                  <TH className="w-32">
                    <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />الربح المحقق</span>
                  </TH>
                  <TH className="w-32">هامش/وحدة</TH>
                  {canManage && <TH className="w-32"></TH>}
                </TR>
              </THead>
              <TBody>
                {activeProducts.map((p) => {
                  const prof = profitMap.get(p.id);
                  const isLow = p.stockQty <= p.lowStockThreshold;
                  const netProfit = prof ? prof.revenue - prof.cost : null;
                  return (
                    <TR key={p.id}>
                      <TD>
                        <div className="font-medium">{p.name}</div>
                        {isLow && (
                          <Badge tone="amber" className="mt-0.5">
                            <AlertTriangle className="w-3 h-3" /> كمية قليلة
                          </Badge>
                        )}
                      </TD>
                      <TD>
                        <span className={isLow ? "text-amber-700 font-bold" : "font-medium"}>
                          {p.stockQty}
                        </span>
                        <span className="text-slate-400 text-xs mr-1">/ {p.lowStockThreshold} حد</span>
                      </TD>
                      <TD className="font-medium">{fmtEgp(p.salePrice)}</TD>
                      <TD className="text-slate-600">{fmtEgp(p.purchasePrice)}</TD>
                      <TD>
                        {netProfit != null ? (
                          <span className={netProfit >= 0 ? "text-green-700 font-medium" : "text-rose-700 font-medium"}>
                            {fmtEgp(netProfit)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {prof && prof.unitsSold > 0 && (
                          <span className="text-slate-400 text-xs mr-1">({prof.unitsSold} وحدة)</span>
                        )}
                      </TD>
                      <TD className="text-blue-700 font-medium">
                        {fmtEgp(p.salePrice - p.purchasePrice)}
                      </TD>
                      {canManage && (
                        <TD>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setRestocking(p)}
                              className="p-1.5 text-slate-400 hover:text-green-600 transition-colors"
                              title="إضافة كمية"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditing(p); setFormOpen(true); }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                              title="تعديل"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(p)}
                              className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-1 rounded border border-slate-200 hover:border-slate-300 transition-colors"
                              title="تعطيل"
                            >
                              تعطيل
                            </button>
                          </div>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Inactive products */}
      {inactiveProducts.length > 0 && (
        <Card className="mt-4 opacity-70">
          <CardHeader title={`إضافات معطّلة (${inactiveProducts.length})`} />
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>الإضافة</TH>
                  <TH className="w-32">سعر البيع</TH>
                  {canManage && <TH className="w-24"></TH>}
                </TR>
              </THead>
              <TBody>
                {inactiveProducts.map((p) => (
                  <TR key={p.id} className="text-slate-400">
                    <TD>{p.name}</TD>
                    <TD>{fmtEgp(p.salePrice)}</TD>
                    {canManage && (
                      <TD>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p)}
                          className="text-xs text-slate-500 hover:text-green-700 px-1.5 py-1 rounded border border-slate-200 transition-colors"
                        >
                          تفعيل
                        </button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      )}

      <ProductForm
        open={formOpen}
        initial={editing}
        onSave={handleSaveProduct}
        onClose={() => { setFormOpen(false); setEditing(null); }}
      />
      <RestockDialog
        open={restocking != null}
        product={restocking}
        onSave={handleRestock}
        onClose={() => setRestocking(null)}
      />
    </>
  );
}
