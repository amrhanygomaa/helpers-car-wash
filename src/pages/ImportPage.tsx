import { useRef, useState } from "react";
import { Download, FileUp, CheckCircle, AlertCircle } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useCatalog } from "../store/CatalogContext";
import { useSettings } from "../store/SettingsContext";
import { useToast } from "../components/ui/Toast";
import { uid } from "../lib/utils";
import { parseCsv, readFileAsText, downloadCsv } from "../lib/csvImport";
import { hasPermission } from "../lib/permissions";
import { useAuth } from "../store/AuthContext";

// ── Product import ────────────────────────────────────────────────────────────

const PRODUCT_HEADERS = [
  "الكود", "الاسم", "الفئة", "الوحدة",
  "سعر الشراء", "سعر الجملة", "سعر التجزئة",
  "أدنى مخزون", "الكمية الأولية",
];

interface ProductRow {
  code: string;
  name: string;
  category: string;
  unit: string;
  purchasePrice: number;
  wholesalePrice: number;
  retailPrice: number;
  minStock: number;
  quantity: number;
  error?: string;
}

function parseProductRows(rows: string[][]): ProductRow[] {
  return rows.slice(1).map((row) => {
    const [code, name, category, unit, pp, wp, rp, ms, qty] = row.map((c) => c.trim());
    const err: string[] = [];
    if (!name) err.push("الاسم مطلوب");
    if (!unit) err.push("الوحدة مطلوبة");
    const purchasePrice = parseFloat(pp ?? "0") || 0;
    const wholesalePrice = parseFloat(wp ?? "0") || 0;
    const retailPrice = parseFloat(rp ?? "0") || 0;
    // OBS-04: a typo like "-50" or "2.5" must surface as a row error instead of
    // silently importing negative prices/stock or truncating fractions.
    if (purchasePrice < 0 || wholesalePrice < 0 || retailPrice < 0) {
      err.push("الأسعار لا يمكن أن تكون سالبة");
    }
    const minStockRaw = Number(ms || "0");
    const quantityRaw = Number(qty || "0");
    if (!Number.isInteger(quantityRaw) || quantityRaw < 0) {
      err.push("الكمية يجب أن تكون عددًا صحيحًا غير سالب");
    }
    if (!Number.isInteger(minStockRaw) || minStockRaw < 0) {
      err.push("أدنى مخزون يجب أن يكون عددًا صحيحًا غير سالب");
    }
    const minStock = Number.isInteger(minStockRaw) && minStockRaw >= 0 ? minStockRaw : 0;
    const quantity = Number.isInteger(quantityRaw) && quantityRaw >= 0 ? quantityRaw : 0;
    return {
      code: code || "",
      name: name || "",
      category: category || "عام",
      unit: unit || "",
      purchasePrice,
      wholesalePrice,
      retailPrice,
      minStock,
      quantity,
      error: err.length ? err.join("، ") : undefined,
    };
  }).filter((r) => r.name || r.code);
}

// ── Customer import ───────────────────────────────────────────────────────────

const CUSTOMER_HEADERS = ["الاسم", "الهاتف", "العنوان", "ملاحظات"];

interface CustomerRow {
  name: string;
  phone: string;
  address: string;
  notes: string;
  error?: string;
}

function parseCustomerRows(rows: string[][]): CustomerRow[] {
  return rows.slice(1).map((row) => {
    const [name, phone, address, notes] = row.map((c) => c.trim());
    const err: string[] = [];
    if (!name) err.push("الاسم مطلوب");
    return {
      name: name || "",
      phone: phone || "",
      address: address || "",
      notes: notes || "",
      error: err.length ? err.join("، ") : undefined,
    };
  }).filter((r) => r.name);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ImportPage() {
  const { addProduct, addCustomer, products } = useCatalog();
  const { settings } = useSettings();
  const { currentUser } = useAuth();
  const toast = useToast();
  const canAddProduct = hasPermission(currentUser, "products", "add");
  const canAddCustomer = hasPermission(currentUser, "customers", "add");

  // Product state
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [productImported, setProductImported] = useState(false);
  const productFileRef = useRef<HTMLInputElement>(null);

  // Customer state
  const [customerRows, setCustomerRows] = useState<CustomerRow[]>([]);
  const [customerImported, setCustomerImported] = useState(false);
  const customerFileRef = useRef<HTMLInputElement>(null);

  void settings;

  async function handleProductFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    const rows = parseCsv(text);
    setProductRows(parseProductRows(rows));
    setProductImported(false);
    if (productFileRef.current) productFileRef.current.value = "";
  }

  async function handleCustomerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    const rows = parseCsv(text);
    setCustomerRows(parseCustomerRows(rows));
    setCustomerImported(false);
    if (customerFileRef.current) customerFileRef.current.value = "";
  }

  function importProducts() {
    const valid = productRows.filter((r) => !r.error);
    if (!valid.length) return;
    const existingCodes = new Set(products.map((p) => p.code));
    let skipped = 0;
    let imported = 0;
    valid.forEach((r) => {
      // BUG-01: skip codes that already exist in the catalog OR earlier in this
      // same file; addProduct now respects the provided code (or auto-assigns).
      if (r.code && existingCodes.has(r.code)) { skipped++; return; }
      const added = addProduct({
        code: r.code,
        barcode: undefined,
        name: r.name,
        category: r.category,
        unit: r.unit,
        retailUnit: undefined,
        purchasePrice: r.purchasePrice,
        wholesalePrice: r.wholesalePrice,
        retailPrice: r.retailPrice,
        piecesPerUnit: undefined,
        quantity: r.quantity,
        looseQuantity: 0,
        minStock: r.minStock,
        hasExpiry: false,
        supplierId: undefined,
        notes: undefined,
        archived: false,
      });
      existingCodes.add(added.code);
      imported++;
    });
    toast.success(
      `تم استيراد ${imported} منتج`,
      skipped > 0 ? `تم تخطي ${skipped} (مكرر الكود)` : undefined
    );
    setProductImported(true);
    setProductRows([]);
  }

  function importCustomers() {
    const valid = customerRows.filter((r) => !r.error);
    if (!valid.length) return;
    valid.forEach((r) => {
      addCustomer({
        code: undefined,
        name: r.name,
        phone: r.phone || undefined,
        address: r.address || undefined,
        notes: r.notes || undefined,
        archived: false,
      });
    });
    toast.success(`تم استيراد ${valid.length} عميل`);
    setCustomerImported(true);
    setCustomerRows([]);
  }

  const productValid = productRows.filter((r) => !r.error).length;
  const productErrors = productRows.filter((r) => r.error).length;
  const customerValid = customerRows.filter((r) => !r.error).length;
  const customerErrors = customerRows.filter((r) => r.error).length;

  return (
    <>
      <PageHeader
        title="استيراد البيانات"
        description="رفع منتجات أو عملاء من ملف CSV (يمكن تحضيره من Excel)"
      />

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">المنتجات</TabsTrigger>
          <TabsTrigger value="customers">العملاء</TabsTrigger>
        </TabsList>

        {/* Products tab */}
        <TabsContent value="products">
          <div className="space-y-4">
            <Card>
              <CardHeader title="الخطوة 1 — تحميل القالب" />
              <CardBody className="flex gap-3 items-center flex-wrap">
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadCsv("قالب_منتجات.csv", [
                      PRODUCT_HEADERS,
                      ["P001", "مثال كرتونة ملح", "بقالة", "كرتونة", "50", "65", "75", "5", "100"],
                    ])
                  }
                >
                  <Download className="w-4 h-4" /> تحميل القالب (CSV)
                </Button>
                <span className="text-sm text-slate-500">
                  افتح الملف في Excel، أضف البيانات، ثم احفظه كـ CSV
                </span>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="الخطوة 2 — رفع الملف" />
              <CardBody className="flex gap-3 items-center flex-wrap">
                <input
                  ref={productFileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  aria-label="ملف CSV للمنتجات"
                  onChange={handleProductFile}
                />
                <Button
                  variant="outline"
                  onClick={() => productFileRef.current?.click()}
                  disabled={!canAddProduct}
                >
                  <FileUp className="w-4 h-4" /> اختر ملف CSV
                </Button>
                {productRows.length > 0 && (
                  <span className="text-sm">
                    <span className="text-emerald-700 font-medium">{productValid} صحيح</span>
                    {productErrors > 0 && (
                      <span className="text-rose-600 font-medium ms-2">{productErrors} خطأ</span>
                    )}
                  </span>
                )}
                {productImported && (
                  <span className="flex items-center gap-1 text-emerald-700 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" /> تم الاستيراد
                  </span>
                )}
              </CardBody>
            </Card>

            {productRows.length > 0 && (
              <Card>
                <CardHeader
                  title={`معاينة (${productRows.length} صف)`}
                  actions={
                    <Button
                      onClick={importProducts}
                      disabled={productValid === 0 || !canAddProduct}
                    >
                      <CheckCircle className="w-4 h-4" /> استيراد {productValid} منتج
                    </Button>
                  }
                />
                <CardBody>
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>الكود</TH>
                          <TH>الاسم</TH>
                          <TH>الفئة</TH>
                          <TH>الوحدة</TH>
                          <TH className="text-end">سعر الشراء</TH>
                          <TH className="text-end">سعر الجملة</TH>
                          <TH className="text-end">الكمية</TH>
                          <TH>الحالة</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {productRows.map((r, idx) => (
                          <TR key={idx} className={r.error ? "bg-rose-50" : undefined}>
                            <TD className="font-mono text-xs">{r.code || "—"}</TD>
                            <TD className="font-medium">{r.name}</TD>
                            <TD>{r.category}</TD>
                            <TD>{r.unit}</TD>
                            <TD className="text-end">{r.purchasePrice}</TD>
                            <TD className="text-end">{r.wholesalePrice}</TD>
                            <TD className="text-end">{r.quantity}</TD>
                            <TD>
                              {r.error ? (
                                <span className="flex items-center gap-1 text-rose-600 text-xs">
                                  <AlertCircle className="w-3 h-3 shrink-0" /> {r.error}
                                </span>
                              ) : (
                                <Badge tone="green">صحيح</Badge>
                              )}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Customers tab */}
        <TabsContent value="customers">
          <div className="space-y-4">
            <Card>
              <CardHeader title="الخطوة 1 — تحميل القالب" />
              <CardBody className="flex gap-3 items-center flex-wrap">
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadCsv("قالب_عملاء.csv", [
                      CUSTOMER_HEADERS,
                      ["أحمد محمد", "01012345678", "القاهرة", "عميل جملة"],
                    ])
                  }
                >
                  <Download className="w-4 h-4" /> تحميل القالب (CSV)
                </Button>
                <span className="text-sm text-slate-500">
                  افتح الملف في Excel، أضف البيانات، ثم احفظه كـ CSV
                </span>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="الخطوة 2 — رفع الملف" />
              <CardBody className="flex gap-3 items-center flex-wrap">
                <input
                  ref={customerFileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  aria-label="ملف CSV للعملاء"
                  onChange={handleCustomerFile}
                />
                <Button
                  variant="outline"
                  onClick={() => customerFileRef.current?.click()}
                  disabled={!canAddCustomer}
                >
                  <FileUp className="w-4 h-4" /> اختر ملف CSV
                </Button>
                {customerRows.length > 0 && (
                  <span className="text-sm">
                    <span className="text-emerald-700 font-medium">{customerValid} صحيح</span>
                    {customerErrors > 0 && (
                      <span className="text-rose-600 font-medium ms-2">{customerErrors} خطأ</span>
                    )}
                  </span>
                )}
                {customerImported && (
                  <span className="flex items-center gap-1 text-emerald-700 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" /> تم الاستيراد
                  </span>
                )}
              </CardBody>
            </Card>

            {customerRows.length > 0 && (
              <Card>
                <CardHeader
                  title={`معاينة (${customerRows.length} صف)`}
                  actions={
                    <Button
                      onClick={importCustomers}
                      disabled={customerValid === 0 || !canAddCustomer}
                    >
                      <CheckCircle className="w-4 h-4" /> استيراد {customerValid} عميل
                    </Button>
                  }
                />
                <CardBody>
                  <Table>
                    <THead>
                      <TR>
                        <TH>الاسم</TH>
                        <TH>الهاتف</TH>
                        <TH>العنوان</TH>
                        <TH>الحالة</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {customerRows.map((r, idx) => (
                        <TR key={idx} className={r.error ? "bg-rose-50" : undefined}>
                          <TD className="font-medium">{r.name}</TD>
                          <TD>{r.phone || "—"}</TD>
                          <TD>{r.address || "—"}</TD>
                          <TD>
                            {r.error ? (
                              <span className="flex items-center gap-1 text-rose-600 text-xs">
                                <AlertCircle className="w-3 h-3 shrink-0" /> {r.error}
                              </span>
                            ) : (
                              <Badge tone="green">صحيح</Badge>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardBody>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

// silence unused import warning from uid (used implicitly via addProduct/addCustomer)
void uid;
