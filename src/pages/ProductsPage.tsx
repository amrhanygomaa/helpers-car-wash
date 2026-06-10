import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Eye, Package, Search } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Select } from "../components/ui/Input";
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
  const { products, suppliers, deleteProduct } = useCatalog();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const canAddProduct = hasPermission(currentUser, "products", "add");
  const canEditProduct = hasPermission(currentUser, "products", "edit");
  const canDeleteProduct = hasPermission(currentUser, "products", "delete");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "expiring" | "expired">(
    "all"
  );
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category)));
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
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
    if (filter === "low") list = list.filter((p) => p.quantity <= p.minStock);
    if (filter === "expiring")
      list = list.filter((p) => {
        if (!p.hasExpiry || !p.expiryDate) return false;
        const du = daysUntil(p.expiryDate);
        return du !== null && du >= 0 && du <= 14;
      });
    if (filter === "expired")
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
  }, [products, q, category, supplier, filter, sort, sortDir]);

  function handleDelete() {
    if (!toDelete) return;
    const ok = deleteProduct(toDelete.id);
    if (ok) toast.success("تم حذف المنتج");
    else toast.error("لا يمكن حذف المنتج", "المنتج مستخدم في فواتير قائمة.");
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
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 end-3 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث بالاسم أو الكود"
                className="pe-9"
              />
            </div>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
              <option value="">كل الفئات</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-52">
              <option value="">كل الموردين</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="w-40"
            >
              <option value="all">كل المنتجات</option>
              <option value="low">قليلة المخزون</option>
              <option value="expiring">تقارب الصلاحية</option>
              <option value="expired">منتهية الصلاحية</option>
            </Select>
            <div className="ms-auto flex items-center gap-2">
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-40"
              >
                <option value="name">الاسم</option>
                <option value="quantity">الكمية</option>
                <option value="wholesalePrice">سعر الجملة</option>
                <option value="retailPrice">سعر التجزئة</option>
                <option value="purchasePrice">سعر الشراء</option>
              </Select>
              <Button
                variant="outline"
                size="sm"
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
                  <TH className="text-end">سعر الشراء</TH>
                  <TH className="text-end">سعر الجملة</TH>
                  <TH className="text-end">سعر التجزئة</TH>
                  <TH>الصلاحية</TH>
                  <TH>المورد</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => {
                  const supName = suppliers.find((s) => s.id === p.supplierId)?.name;
                  const du = daysUntil(p.expiryDate);
                  const low = p.quantity <= p.minStock;
                  const expired = p.hasExpiry && du !== null && du < 0;
                  const soon =
                    p.hasExpiry && du !== null && du >= 0 && du <= 14;
                  return (
                    <TR key={p.id}>
                      <TD className="font-mono text-xs">{p.code}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{p.name}</span>
                          {low && <Badge tone="amber">مخزون منخفض</Badge>}
                          {expired && <Badge tone="red">منتهي</Badge>}
                          {soon && !expired && <Badge tone="rose">قارب الانتهاء</Badge>}
                        </div>
                      </TD>
                      <TD>{p.category}</TD>
                      <TD>{p.unit}</TD>
                      <TD className="text-end font-medium">
                        {p.piecesPerUnit
                          ? `${p.quantity} ${p.unit}${p.looseQuantity ? ` + ${p.looseQuantity} ${p.retailUnit ?? "قطعة"}` : ""}`
                          : `${p.quantity} ${p.unit}`}
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
