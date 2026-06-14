import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Eye, Package, Search, Archive, ArchiveRestore } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Field, Input, Select } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { ConfirmDialog } from "../components/ui/Dialog";
import { useCatalog } from "../store/CatalogContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency } from "../lib/format";
import { daysUntil } from "../lib/utils";
import { ProductFormDialog } from "../features/products/ProductForm";
import { ProductDetailsDrawer } from "../features/products/ProductDetailsDrawer";
import type { Product } from "../types";
import { hasPermission } from "../lib/permissions";

type SortKey = "name" | "quantity" | "wholesalePrice" | "retailPrice" | "purchasePrice";

export function ProductsPage() {
  const { products, suppliers, deleteProduct, archiveProduct } = useCatalog();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const canAddProduct = hasPermission(currentUser, "products", "add");
  const canEditProduct = hasPermission(currentUser, "products", "edit");
  const canDeleteProduct = hasPermission(currentUser, "products", "delete");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [expiryFilter, setExpiryFilter] = useState<"all" | "expiring" | "expired">("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category)));
  }, [products]);

  const archivedCount = useMemo(() => products.filter((p) => p.archived).length, [products]);

  const filtered = useMemo(() => {
    let list = products.filter((p) => !p.archived);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(t) ||
          p.code.toLowerCase().includes(t) ||
          (p.barcode ?? "").toLowerCase().includes(t)
      );
    }
    if (category) list = list.filter((p) => p.category === category);
    if (supplier) list = list.filter((p) => p.supplierId === supplier);
    // حالة الكمية: قارب على النفاذ (أقل من أو يساوي الحد الأدنى لكن غير صفر) / نفذ (صفر)
    if (stockFilter === "low")
      list = list.filter((p) => p.quantity > 0 && p.quantity <= p.minStock);
    if (stockFilter === "out") list = list.filter((p) => p.quantity <= 0);

    // حالة الصلاحية: قارب الانتهاء (خلال 14 يوم) / منتهي
    if (expiryFilter === "expiring")
      list = list.filter((p) => {
        if (!p.hasExpiry || !p.expiryDate) return false;
        const du = daysUntil(p.expiryDate);
        return du !== null && du >= 0 && du <= 14;
      });
    if (expiryFilter === "expired")
      list = list.filter((p) => {
        if (!p.hasExpiry || !p.expiryDate) return false;
        const du = daysUntil(p.expiryDate);
        return du !== null && du < 0;
      });

    list = [...list].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""), "ar");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [products, q, category, supplier, expiryFilter, stockFilter, sort, sortDir]);

  function handleDelete() {
    if (!toDelete) return;
    const ok = deleteProduct(toDelete.id);
    if (ok) {
      toast.success("تم حذف المنتج");
    } else {
      archiveProduct(toDelete.id, true);
      toast.success("تم أرشفة المنتج", "المنتج محفوظ في الأرشيف ويمكن استعادته");
    }
    setToDelete(null);
  }

  return (
    <>
      <PageHeader
        title="المنتجات"
        description={`إدارة كل المنتجات والأسعار والمخزون (${products.length})`}
        actions={
          canAddProduct ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              إضافة منتج
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="قائمة المنتجات"
          subtitle="ابحث أو صفّي حسب الفئة، المورد، الحالة"
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
          <div className="flex flex-wrap gap-2 items-end">
            <Field label="بحث" className="w-64">
              <div className="relative">
                <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 end-3 text-slate-400" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="بحث بالاسم أو الكود"
                  className="pe-9"
                />
              </div>
            </Field>
            <Field label="الفئة" className="w-44">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">كل الفئات</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="المورد" className="w-52">
              <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">كل الموردين</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="حالة الصلاحية" className="w-40">
              <Select
                value={expiryFilter}
                onChange={(e) => setExpiryFilter(e.target.value as typeof expiryFilter)}
              >
                <option value="all">كل حالات الصلاحية</option>
                <option value="expiring">قارب الانتهاء</option>
                <option value="expired">منتهي</option>
              </Select>
            </Field>
            <Field label="حالة الكمية" className="w-40">
              <Select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
              >
                <option value="all">كل حالات الكمية</option>
                <option value="low">قارب على النفاذ</option>
                <option value="out">نفذ</option>
              </Select>
            </Field>
            <div className="ms-auto flex items-end gap-2">
              <Field label="ترتيب حسب" className="w-40">
                <Select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                >
                  <option value="name">الاسم</option>
                  <option value="quantity">الكمية</option>
                  <option value="wholesalePrice">سعر الجملة</option>
                  <option value="retailPrice">سعر التجزئة</option>
                  <option value="purchasePrice">سعر الشراء</option>
                </Select>
              </Field>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              >
                {sortDir === "asc" ? "تصاعدي" : "تنازلي"}
              </Button>
            </div>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Package className="w-5 h-5" />}
              title="لا توجد منتجات مطابقة"
              description="جرّب تعديل البحث أو الفلاتر."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الكود</TH>
                  <TH>المنتج</TH>
                  <TH>الفئة</TH>
                  <TH>الوحدة</TH>
                  <TH className="text-end">الكمية</TH>
                  <TH>حالة الكمية</TH>
                  <TH className="text-end">سعر الشراء</TH>
                  <TH className="text-end">سعر الجملة</TH>
                  <TH className="text-end">سعر التجزئة</TH>
                  <TH>الصلاحية</TH>
                  <TH>حالة الصلاحية</TH>
                  <TH>المورد</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => {
                  const supName = suppliers.find((s) => s.id === p.supplierId)?.name;
                  const du = daysUntil(p.expiryDate);
                  const out = p.quantity <= 0;
                  const low = !out && p.quantity <= p.minStock;
                  const expired = p.hasExpiry && du !== null && du < 0;
                  const soon =
                    p.hasExpiry && du !== null && du >= 0 && du <= 14;
                  return (
                    <TR key={p.id}>
                      <TD className="font-mono text-xs">{p.code}</TD>
                      <TD>
                        <span className="font-medium text-slate-900">{p.name}</span>
                      </TD>
                      <TD>{p.category}</TD>
                      <TD>{p.unit}</TD>
                      <TD className="text-end font-medium">
                        {p.piecesPerUnit
                          ? `${p.quantity} ${p.unit}${p.looseQuantity ? ` + ${p.looseQuantity} ${p.retailUnit ?? "قطعة"}` : ""}`
                          : `${p.quantity} ${p.unit}`}
                      </TD>
                      <TD>
                        {out ? (
                          <Badge tone="red">نفذ</Badge>
                        ) : low ? (
                          <Badge tone="amber">قارب على النفاذ</Badge>
                        ) : (
                          <Badge tone="green">متوفر</Badge>
                        )}
                      </TD>
                      <TD className="text-end text-slate-600">
                        {formatCurrency(p.purchasePrice, settings.currency)}
                      </TD>
                      <TD className="text-end font-medium">
                        {formatCurrency(p.wholesalePrice, settings.currency)}
                      </TD>
                      <TD className="text-end font-medium">
                        {formatCurrency(p.retailPrice, settings.currency)}
                      </TD>
                      <TD>
                        {p.hasExpiry && p.expiryDate ? (
                          <span className="text-xs text-slate-600">
                            {p.expiryDate}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TD>
                      <TD>
                        {!p.hasExpiry ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : expired ? (
                          <Badge tone="red">منتهي</Badge>
                        ) : soon ? (
                          <Badge tone="rose">قارب الانتهاء</Badge>
                        ) : (
                          <Badge tone="green">سليمة</Badge>
                        )}
                      </TD>
                      <TD className="text-slate-600 text-xs">{supName ?? "—"}</TD>
                      <TD className="text-end">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setViewing(p)}
                            title="عرض"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEditProduct ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditing(p);
                                setFormOpen(true);
                              }}
                              title="تعديل"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          ) : null}
                          {canDeleteProduct ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => setToDelete(p)}
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
                {showArchived && products.filter((p) => p.archived).map((p) => (
                  <TR key={p.id} className="opacity-50 bg-slate-50">
                    <TD className="text-slate-400 font-mono text-xs">{p.code}</TD>
                    <TD className="text-slate-500 line-through">{p.name}</TD>
                    <TD className="text-slate-400">{p.category}</TD>
                    <TD />
                    <TD />
                    <TD />
                    <TD />
                    <TD />
                    <TD />
                    <TD />
                    <TD />
                    <TD />
                    <TD className="text-end">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-slate-600 h-7 text-xs"
                          onClick={() => { archiveProduct(p.id, false); toast.success("تمت الاستعادة"); }}
                          title="استعادة من الأرشيف"
                        >
                          <ArchiveRestore className="w-3 h-3" />
                          استعادة
                        </Button>
                        {canDeleteProduct && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 w-7 h-7"
                            onClick={() => setToDelete(p)}
                            title="حذف نهائي"
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

      <ProductFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
      />
      <ProductDetailsDrawer
        product={viewing}
        onClose={() => setViewing(null)}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="حذف منتج"
        message={`هل أنت متأكد من حذف "${toDelete?.name}"؟`}
        variant="danger"
        confirmText="حذف"
      />
    </>
  );
}
