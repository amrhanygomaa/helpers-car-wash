import { Drawer } from "../../components/ui/Drawer";
import { Badge } from "../../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import type { Product } from "../../types";
import { useApp } from "../../store/AppContext";
import { formatCurrency, formatDate } from "../../lib/format";
import { formatStockMovementReference } from "../../lib/stockMovement";
import { daysUntil } from "../../lib/utils";
import { EmptyState } from "../../components/ui/EmptyState";
import { Activity } from "lucide-react";

export function ProductDetailsDrawer({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const {
    stockMovements,
    suppliers,
    settings,
    salesInvoices,
    purchaseInvoices,
    salesReturns,
    purchaseReturns,
  } = useApp();
  if (!product) return null;

  const supplier = suppliers.find((s) => s.id === product.supplierId);
  const movements = stockMovements
    .filter((m) => m.productId === product.id)
    .slice(0, 30);

  const expDays = daysUntil(product.expiryDate);

  return (
    <Drawer
      open={!!product}
      onClose={onClose}
      title={product.name}
      subtitle={`الكود: ${product.code} • ${product.category}`}
      width={520}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Info label="الكمية الحالية">
            <span className="text-lg font-semibold">
              {product.quantity} {product.unit}
            </span>
          </Info>
          <Info label="الحد الأدنى">
            {product.minStock} {product.unit}
          </Info>
          <Info label="سعر الشراء">
            {formatCurrency(product.purchasePrice, settings.currency)}
          </Info>
          <Info label="سعر البيع">
            {formatCurrency(product.sellingPrice, settings.currency)}
          </Info>
          <Info label="المورد">{supplier?.name ?? "—"}</Info>
          <Info label="الصلاحية">
            {product.hasExpiry && product.expiryDate ? (
              <div className="flex items-center gap-2">
                <span>{formatDate(product.expiryDate)}</span>
                {expDays !== null && (
                  <Badge
                    tone={
                      expDays < 0
                        ? "red"
                        : expDays <= 7
                        ? "amber"
                        : expDays <= 30
                        ? "amber"
                        : "green"
                    }
                  >
                    {expDays < 0
                      ? `منتهي منذ ${Math.abs(expDays)} يوم`
                      : `يتبقى ${expDays} يوم`}
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-slate-500">لا ينطبق</span>
            )}
          </Info>
        </div>
        {product.notes ? (
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm text-slate-700">
            <div className="text-xs text-slate-500 mb-1">ملاحظات</div>
            {product.notes}
          </div>
        ) : null}
        <div>
          <div className="text-sm font-medium text-slate-900 mb-2">
            سجل حركات المخزون
          </div>
          {movements.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-5 h-5" />}
              title="لا توجد حركات"
              description="سيظهر هنا سجل كل حركة شراء / بيع / تعديل."
            />
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <Table>
                <THead>
                  <TR>
                    <TH>التاريخ</TH>
                    <TH>النوع</TH>
                    <TH className="text-end">الكمية</TH>
                    <TH>السبب / المرجع</TH>
                  </TR>
                </THead>
                <TBody>
                  {movements.map((m) => (
                    <TR key={m.id}>
                      <TD>{formatDate(m.date)}</TD>
                      <TD>
                        <MovementBadge type={m.type} />
                      </TD>
                      <TD
                        className={`text-end font-medium ${
                          m.quantity >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </TD>
                      <TD className="text-xs text-slate-500">
                        {formatStockMovementReference(m, {
                          salesInvoices,
                          purchaseInvoices,
                          salesReturns,
                          purchaseReturns,
                        })}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 mt-1">{children}</div>
    </div>
  );
}

function MovementBadge({ type }: { type: string }) {
  if (type === "purchase") return <Badge tone="blue">شراء</Badge>;
  if (type === "sale") return <Badge tone="green">بيع</Badge>;
  if (type === "adjustment-in") return <Badge tone="emerald">تعديل +</Badge>;
  if (type === "adjustment-out") return <Badge tone="rose">تعديل -</Badge>;
  if (type === "return") return <Badge tone="amber">مرتجع</Badge>;
  return <Badge>{type}</Badge>;
}
