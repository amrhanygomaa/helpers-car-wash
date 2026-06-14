import { useEffect, useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Input";
import type { Product } from "../../types";
import { useCatalog } from "../../store/CatalogContext";
import { useToast } from "../../components/ui/Toast";

const UNITS = ["كيلو", "جرام", "لتر", "كيس", "علبة", "كرتونة", "زجاجة", "كوب", "قطعة", "علبة صغيرة"];

type FormState = Omit<Product, "id" | "createdAt">;

const EMPTY: FormState = {
  code: "",
  name: "",
  barcode: undefined,
  category: "مواد غذائية",
  unit: "كرتونة",
  retailUnit: undefined,
  purchasePrice: 0,
  wholesalePrice: 0,
  retailPrice: 0,
  piecesPerUnit: undefined,
  quantity: 0,
  looseQuantity: undefined,
  minStock: 5,
  hasExpiry: false,
  expiryDate: undefined,
  supplierId: undefined,
  notes: "",
};

export function ProductFormDialog({
  open,
  onClose,
  editing,
  onCreated,
  defaultSupplierId,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Product | null;
  /** Called with the newly created product after a successful add (not on edit). */
  onCreated?: (product: Product) => void;
  /** Pre-selects this supplier when creating a new product. */
  defaultSupplierId?: string;
}) {
  const { addProduct, updateProduct, suppliers, products, nextProductCode } = useCatalog();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);

  const existingCategories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const allCategories = useMemo(
    () => [...new Set([...existingCategories, ...customCategories])].sort(),
    [existingCategories, customCategories]
  );
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");

  const existingUnits = useMemo(
    () => [...new Set(products.map((p) => p.unit).filter(Boolean))].sort(),
    [products]
  );
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const allUnits = useMemo(
    () => [...new Set([...UNITS, ...existingUnits, ...customUnits])].sort(),
    [existingUnits, customUnits]
  );
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitInput, setNewUnitInput] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editing) {
      const { id: _id, createdAt: _c, ...rest } = editing;
      void _id;
      void _c;
      setForm(rest);
    } else {
      setForm({ ...EMPTY, code: nextProductCode.toString(), supplierId: defaultSupplierId });
    }
    setErrors({});
    setAddingCategory(false);
    setNewCategoryInput("");
    setCustomCategories([]);
    setAddingUnit(false);
    setNewUnitInput("");
    setCustomUnits([]);
  }, [editing, open, nextProductCode, defaultSupplierId]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "الكود مطلوب";
    if (!form.name.trim()) e.name = "اسم المنتج مطلوب";
    if (!form.category.trim()) e.category = "الفئة مطلوبة";
    if (form.purchasePrice < 0) e.purchasePrice = "يجب أن يكون موجباً";
    if (form.wholesalePrice < 0) e.wholesalePrice = "يجب أن يكون موجباً";
    if (form.retailPrice < 0) e.retailPrice = "يجب أن يكون موجباً";
    if (!form.piecesPerUnit && form.retailPrice < form.wholesalePrice) {
      e.retailPrice = "سعر التجزئة يجب أن يكون أكبر من أو يساوي سعر الجملة";
    }
    if (form.piecesPerUnit && !form.retailUnit?.trim()) {
      e.retailUnit = "اسم وحدة التجزئة مطلوب";
    }
    if (form.quantity < 0) e.quantity = "يجب أن يكون موجباً";
    if (form.minStock < 0) e.minStock = "يجب أن يكون موجباً";
    if (form.hasExpiry && !form.expiryDate) e.expiryDate = "تاريخ الصلاحية مطلوب";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function confirmNewCategory() {
    const trimmed = newCategoryInput.trim();
    if (trimmed) {
      if (!allCategories.includes(trimmed)) {
        setCustomCategories((prev) => [...prev, trimmed]);
      }
      set("category", trimmed);
    }
    setAddingCategory(false);
    setNewCategoryInput("");
  }

  function confirmNewUnit() {
    const trimmed = newUnitInput.trim();
    if (trimmed) {
      if (!allUnits.includes(trimmed)) {
        setCustomUnits((prev) => [...prev, trimmed]);
      }
      set("unit", trimmed);
    }
    setAddingUnit(false);
    setNewUnitInput("");
  }

  function handleSubmit() {
    if (!validate()) return;
    if (editing) {
      updateProduct(editing.id, form);
      toast.success("تم تحديث المنتج");
    } else {
      const created = addProduct(form);
      toast.success("تم إضافة المنتج");
      onCreated?.(created);
    }
    onClose();
  }

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "تعديل منتج" : "إضافة منتج جديد"}
      subtitle="املأ بيانات المنتج — العمليات تحفظ تلقائياً في المخزون"
      width="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit}>
            {editing ? "حفظ التعديلات" : "إضافة المنتج"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">

        {/* كود المنتج + اسم المنتج */}
        <Field label="كود المنتج" required error={errors.code}>
          <Input
            value={form.code}
            readOnly
            className="bg-gray-100 cursor-not-allowed text-gray-600 font-mono"
          />
        </Field>
        <Field label="اسم المنتج" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="مثل: أرز مصري 5 كجم"
          />
        </Field>

        {/* الباركود - اختياري، يُستخدم للمسح الضوئي عند البيع */}
        <Field label="الباركود" className="col-span-2">
          <Input
            value={form.barcode ?? ""}
            onChange={(e) => set("barcode", e.target.value || undefined)}
            placeholder="باركود المنتج (EAN/UPC) — اختياري، يُستخدم للمسح الضوئي عند إنشاء الفواتير"
            className="font-mono"
          />
        </Field>

        {/* الفئة + الوحدة */}
        <Field label="الفئة" required error={errors.category}>
          <div className="flex gap-2">
            <Select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="flex-1"
            >
              <option value="">— اختر فئة —</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              {form.category && !allCategories.includes(form.category) && (
                <option value={form.category}>{form.category}</option>
              )}
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => { setAddingCategory(true); setNewCategoryInput(""); }}
              title="إضافة فئة جديدة"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {addingCategory && (
            <div className="flex gap-1.5 mt-1.5">
              <Input
                autoFocus
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); confirmNewCategory(); }
                  if (e.key === "Escape") setAddingCategory(false);
                }}
                placeholder="اسم الفئة الجديدة"
                className="flex-1"
              />
              <Button type="button" size="icon" variant="outline" onClick={confirmNewCategory}>
                <Check className="w-4 h-4 text-green-600" />
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => setAddingCategory(false)}>
                <X className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          )}
        </Field>
        <Field label="الوحدة">
          <div className="flex gap-2">
            <Select
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
              className="flex-1"
            >
              <option value="">— اختر وحدة —</option>
              {allUnits.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
              {form.unit && !allUnits.includes(form.unit) && (
                <option value={form.unit}>{form.unit}</option>
              )}
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => { setAddingUnit(true); setNewUnitInput(""); }}
              title="إضافة وحدة جديدة"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {addingUnit && (
            <div className="flex gap-1.5 mt-1.5">
              <Input
                autoFocus
                value={newUnitInput}
                onChange={(e) => setNewUnitInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); confirmNewUnit(); }
                  if (e.key === "Escape") setAddingUnit(false);
                }}
                placeholder="اسم الوحدة الجديدة"
                className="flex-1"
              />
              <Button type="button" size="icon" variant="outline" onClick={confirmNewUnit}>
                <Check className="w-4 h-4 text-green-600" />
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => setAddingUnit(false)}>
                <X className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          )}
        </Field>

        {/* سعر الشراء + سعر الجملة */}
        <Field label="سعر الشراء" required error={errors.purchasePrice}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.purchasePrice}
            onChange={(e) => set("purchasePrice", Number(e.target.value))}
          />
        </Field>
        <Field label="سعر الجملة" required error={errors.wholesalePrice}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.wholesalePrice}
            onChange={(e) => set("wholesalePrice", Number(e.target.value))}
          />
        </Field>

        {/* سعر التجزئة + عدد القطع */}
        <Field
          label={form.piecesPerUnit ? `سعر ${form.retailUnit || "القطعة"}` : "سعر التجزئة للوحدة"}
          required
          error={errors.retailPrice}
        >
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.retailPrice}
            onChange={(e) => set("retailPrice", Number(e.target.value))}
          />
        </Field>
        <Field label="عدد القطع في الوحدة">
          <Input
            type="number"
            min={1}
            value={form.piecesPerUnit ?? ""}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : undefined;
              set("piecesPerUnit", val);
              if (!val) {
                set("retailUnit", undefined);
                set("looseQuantity", undefined);
              }
            }}
            placeholder={`مثل: 24 قطعة في ${form.unit}`}
          />
        </Field>

        {/* حقول التجزئة - تظهر فقط لما يكون فيه عدد قطع */}
        {form.piecesPerUnit ? (
          <>
            <Field label="اسم وحدة التجزئة" required error={errors.retailUnit}>
              <Input
                value={form.retailUnit ?? ""}
                onChange={(e) => set("retailUnit", e.target.value || undefined)}
                placeholder="مثل: قطعة، كيس، علبة صغيرة"
              />
            </Field>
            <Field label={`القطع المفردة (${form.retailUnit || "قطعة"})`}>
              <Input
                type="number"
                min={0}
                max={form.piecesPerUnit - 1}
                value={form.looseQuantity ?? 0}
                onChange={(e) => set("looseQuantity", Number(e.target.value) || undefined)}
                placeholder="0"
              />
            </Field>
          </>
        ) : null}

        {/* الكمية الحالية + الحد الأدنى */}
        <Field label={`الكمية الحالية (${form.unit})`} required error={errors.quantity}>
          <Input
            type="number"
            min={0}
            value={form.quantity}
            onChange={(e) => set("quantity", Number(e.target.value))}
          />
        </Field>
        <Field label="الحد الأدنى للمخزون" required error={errors.minStock}>
          <Input
            type="number"
            min={0}
            value={form.minStock}
            onChange={(e) => set("minStock", Number(e.target.value))}
          />
        </Field>

        {/* المورد + تاريخ الصلاحية */}
        <Field label="المورد">
          <Select
            value={form.supplierId ?? ""}
            onChange={(e) => set("supplierId", e.target.value ? e.target.value : undefined)}
          >
            <option value="">— غير محدد —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="له تاريخ صلاحية؟">
          <div className="flex items-center gap-3 h-9">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="hasExp"
                checked={form.hasExpiry}
                onChange={() => set("hasExpiry", true)}
              />
              نعم
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="hasExp"
                checked={!form.hasExpiry}
                onChange={() => {
                  set("hasExpiry", false);
                  set("expiryDate", undefined);
                }}
              />
              لا
            </label>
          </div>
        </Field>

        {/* تاريخ الصلاحية - يظهر فقط لو اختار نعم */}
        {form.hasExpiry ? (
          <Field label="تاريخ الصلاحية" required error={errors.expiryDate} className="col-span-2">
            <Input
              type="date"
              value={form.expiryDate ?? ""}
              onChange={(e) => set("expiryDate", e.target.value || undefined)}
            />
          </Field>
        ) : null}

        {/* ملاحظات - اختياري */}
        <Field label="ملاحظات" className="col-span-2">
          <Textarea
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>

      </div>
    </Dialog>
  );
}
