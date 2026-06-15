import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, FileText, Pencil, Plus, Printer, Search, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { ConfirmDialog } from "../components/ui/Dialog";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { hasPermission } from "../lib/permissions";
import { useAuth } from "../store/AuthContext";
import { printAppRoute } from "../lib/print";
import type { Quotation } from "../types";

export function QuotationsPage() {
  const { quotations, deleteQuotation } = useInvoicing();
  const { settings } = useSettings();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const canAdd = hasPermission(currentUser, "salesInvoices", "add");
  const canEdit = hasPermission(currentUser, "salesInvoices", "edit");
  const canDelete = hasPermission(currentUser, "salesInvoices", "delete");
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<Quotation | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter(
      (x) =>
        x.quotationNumber.toLowerCase().includes(q) ||
        x.customerName.toLowerCase().includes(q)
    );
  }, [quotations, search]);

  const draftCount = quotations.filter((q) => q.status === "draft").length;
  const convertedCount = quotations.filter((q) => q.status === "converted").length;

  return (
    <>
      <PageHeader
        title="عروض الأسعار"
        description="إنشاء عروض أسعار وتحويلها إلى فواتير مبيعات"
        actions={
          canAdd ? (
            <Button onClick={() => navigate("/quotations/new")}>
              <Plus className="w-4 h-4" /> عرض سعر جديد
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
        <StatCard label="إجمالي العروض" value={quotations.length} />
        <StatCard label="عروض مفتوحة" value={draftCount} tone="amber" />
        <StatCard label="محولة لفواتير" value={convertedCount} tone="green" />
      </div>

      <Card>
        <CardHeader
          title={`عروض الأسعار (${filtered.length})`}
          actions={
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="ps-9 w-52"
                placeholder="بحث..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          }
        />
        <CardBody>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-5 h-5" />}
              title="لا توجد عروض أسعار"
              description="اضغط على «عرض سعر جديد» لإنشاء أول عرض"
              action={
                canAdd ? (
                  <Button onClick={() => navigate("/quotations/new")}>
                    <Plus className="w-4 h-4" /> عرض سعر جديد
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الرقم</TH>
                  <TH>التاريخ</TH>
                  <TH>العميل</TH>
                  <TH>صالح حتى</TH>
                  <TH className="text-end">الإجمالي</TH>
                  <TH>الحالة</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((q) => (
                  <TR
                    key={q.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/quotations/${q.id}`)}
                  >
                    <TD className="font-mono text-xs text-slate-600">{q.quotationNumber}</TD>
                    <TD>{formatDate(q.date)}</TD>
                    <TD className="font-medium text-slate-900">{q.customerName}</TD>
                    <TD>{q.validUntil ? formatDate(q.validUntil) : "—"}</TD>
                    <TD className="text-end font-semibold">
                      {formatCurrency(q.total, settings.currency)}
                    </TD>
                    <TD>
                      <StatusBadge status={q.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "converted") return <Badge tone="green">محولة</Badge>;
  return <Badge tone="amber">مفتوحة</Badge>;
}

function StatCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "amber" | "green";
}) {
  const colors: Record<string, string> = {
    slate: "text-slate-900",
    amber: "text-amber-700",
    green: "text-emerald-700",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colors[tone]}`}>{value}</div>
    </div>
  );
}
