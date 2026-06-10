import { useMemo, useState } from "react";
import { Shield } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Field, Input, Select } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { useAuditLog } from "../store/AuditLogContext";
import { formatDateTime } from "../lib/format";
import type { AuditAction } from "../types";

const ACTION_META: Record<
  AuditAction,
  {
    label: string;
    tone: "green" | "blue" | "orange" | "red" | "amber" | "indigo" | "emerald" | "rose" | "slate";
  }
> = {
  invoice_sale_created:    { label: "إنشاء فاتورة مبيعات",    tone: "green" },
  invoice_sale_updated:    { label: "تعديل فاتورة مبيعات",    tone: "blue" },
  invoice_sale_cancelled:  { label: "إلغاء فاتورة مبيعات",    tone: "orange" },
  invoice_sale_deleted:    { label: "حذف فاتورة مبيعات",      tone: "red" },
  invoice_purchase_created:{ label: "إنشاء فاتورة مشتريات",   tone: "green" },
  invoice_purchase_updated:{ label: "تعديل فاتورة مشتريات",   tone: "blue" },
  invoice_purchase_deleted:{ label: "حذف فاتورة مشتريات",     tone: "red" },
  return_sale_created:     { label: "مرتجع مبيعات",            tone: "amber" },
  return_purchase_created: { label: "مرتجع مشتريات",           tone: "amber" },
  stock_adjusted:          { label: "تعديل مخزون",             tone: "indigo" },
  product_deleted:         { label: "حذف منتج",                tone: "red" },
  customer_deleted:        { label: "حذف عميل",                tone: "red" },
  supplier_deleted:        { label: "حذف مورد",                tone: "red" },
  cash_manual_add:         { label: "إضافة نقدية",             tone: "emerald" },
  cash_manual_remove:      { label: "خصم نقدي",                tone: "rose" },
  product_archived:        { label: "أرشفة منتج",              tone: "slate" },
  product_restored:        { label: "استعادة منتج",            tone: "blue" },
  customer_archived:       { label: "أرشفة عميل",              tone: "slate" },
  customer_restored:       { label: "استعادة عميل",            tone: "blue" },
  supplier_archived:       { label: "أرشفة مورد",              tone: "slate" },
  supplier_restored:       { label: "استعادة مورد",            tone: "blue" },
};

type Category = "all" | "sales" | "purchases" | "returns" | "stock" | "deletions" | "cash";

const CATEGORY_ACTIONS: Record<Category, AuditAction[] | null> = {
  all:       null,
  sales:     ["invoice_sale_created", "invoice_sale_updated", "invoice_sale_cancelled", "invoice_sale_deleted"],
  purchases: ["invoice_purchase_created", "invoice_purchase_updated", "invoice_purchase_deleted"],
  returns:   ["return_sale_created", "return_purchase_created"],
  stock:     ["stock_adjusted"],
  deletions: ["product_deleted", "customer_deleted", "supplier_deleted"],
  cash:      ["cash_manual_add", "cash_manual_remove"],
};

const PAGE_SIZE = 50;

export function AuditLogPage() {
  const { auditLogs } = useAuditLog();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(0);

  const users = useMemo(() => {
    const map = new Map<string, string>();
    auditLogs.forEach((l) => map.set(l.userId, l.userName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [auditLogs]);

  const filtered = useMemo(() => {
    const qLow = q.toLowerCase();
    const actions = CATEGORY_ACTIONS[category];
    return auditLogs.filter((l) => {
      if (actions && !actions.includes(l.action)) return false;
      if (userId && l.userId !== userId) return false;
      if (qLow && !l.entityLabel.toLowerCase().includes(qLow) && !l.details?.toLowerCase().includes(qLow))
        return false;
      return true;
    });
  }, [auditLogs, q, category, userId]);

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE);

  function handleQ(v: string) { setQ(v); setPage(0); }
  function handleCategory(v: Category) { setCategory(v); setPage(0); }
  function handleUser(v: string) { setUserId(v); setPage(0); }

  return (
    <>
      <PageHeader
        title="سجل التدقيق"
        description={`آخر ${auditLogs.length.toLocaleString()} عملية مسجلة`}
      />

      <Card>
        <CardHeader title="تصفية السجل" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="بحث">
              <Input
                value={q}
                onChange={(e) => handleQ(e.target.value)}
                placeholder="ابحث في الكيان أو التفاصيل..."
              />
            </Field>
            <Field label="التصنيف">
              <Select value={category} onChange={(e) => handleCategory(e.target.value as Category)}>
                <option value="all">الكل</option>
                <option value="sales">فواتير المبيعات</option>
                <option value="purchases">فواتير المشتريات</option>
                <option value="returns">المرتجعات</option>
                <option value="stock">المخزون</option>
                <option value="deletions">الحذف</option>
                <option value="cash">النقدية</option>
              </Select>
            </Field>
            <Field label="المستخدم">
              <Select value={userId} onChange={(e) => handleUser(e.target.value)}>
                <option value="">جميع المستخدمين</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="الإجراءات المسجلة"
          subtitle={filtered.length !== auditLogs.length ? `${filtered.length} نتيجة` : undefined}
        />

        {auditLogs.length === 0 ? (
          <CardBody>
            <div className="text-center py-12">
              <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <div className="text-sm font-medium text-slate-600">لا توجد سجلات تدقيق بعد</div>
              <div className="text-xs text-slate-400 mt-1">
                تظهر الإجراءات تلقائياً بعد إنشاء الفواتير أو حذف البيانات أو تعديل المخزون
              </div>
            </div>
          </CardBody>
        ) : filtered.length === 0 ? (
          <CardBody>
            <div className="text-center py-12 text-sm text-slate-500">لا توجد نتائج مطابقة</div>
          </CardBody>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-40">التاريخ والوقت</TH>
                    <TH className="w-52">الإجراء</TH>
                    <TH>الكيان</TH>
                    <TH className="w-36">المستخدم</TH>
                    <TH>التفاصيل</TH>
                  </TR>
                </THead>
                <TBody>
                  {visible.map((log) => {
                    const meta = ACTION_META[log.action];
                    return (
                      <TR key={log.id}>
                        <TD className="whitespace-nowrap text-slate-500 text-xs font-mono">
                          {formatDateTime(log.timestamp)}
                        </TD>
                        <TD>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </TD>
                        <TD className="font-medium text-slate-900 text-sm">{log.entityLabel}</TD>
                        <TD className="text-slate-600 text-sm">{log.userName}</TD>
                        <TD className="text-slate-500 text-xs">{log.details ?? "—"}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            {visible.length < filtered.length && (
              <div className="p-4 text-center border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  className="text-sm text-brand-600 hover:text-brand-800 font-medium"
                >
                  عرض المزيد ({(filtered.length - visible.length).toLocaleString()} متبقٍ)
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
