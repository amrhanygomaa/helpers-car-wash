import { useMemo, useState } from "react";
import { Plus, Search, Settings2, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useCarwash } from "../store/CarwashContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { ConfirmDialog } from "../components/ui/Dialog";
import { Input, Select } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { EmptyState } from "../components/ui/EmptyState";
import { ServiceFormDialog } from "../features/services/ServiceFormDialog";
import type { WashService, WashServiceCategory } from "../types";
import { formatCurrency } from "../lib/format";
import { hasPermission } from "../lib/permissions";

export function ServicesPage() {
  const { washServices, updateWashService, deleteWashService } = useCarwash();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const canAdd = hasPermission(currentUser, "washServices", "add");
  const canEdit = hasPermission(currentUser, "washServices", "edit");
  const canDelete = hasPermission(currentUser, "washServices", "delete");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WashService | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"" | WashServiceCategory>("");
  const [activeFilter, setActiveFilter] = useState<"" | "active" | "inactive">("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return washServices.filter((s) => {
      if (categoryFilter && s.category !== categoryFilter) return false;
      if (activeFilter === "active" && !s.active) return false;
      if (activeFilter === "inactive" && s.active) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  }, [washServices, search, categoryFilter, activeFilter]);

  function categoryLabel(category: WashServiceCategory) {
    if (category === "chemical") return "كيماوي";
    if (category === "extra") return "إضافية";
    return "غسيل";
  }

  return (
    <>
      <PageHeader
        title="خدمات الغسيل"
        description="خدمات الغسيل وأسعارها والخامات المرتبطة بكل خدمة"
        actions={
          canAdd ? (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="w-4 h-4" /> إضافة خدمة
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <Input
            className="ps-9"
            placeholder="بحث باسم الخدمة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-40"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as "" | WashServiceCategory)}
        >
          <option value="">كل الأنواع</option>
          <option value="wash">خدمات غسيل</option>
          <option value="chemical">كيماوي</option>
          <option value="extra">خدمات إضافية</option>
        </Select>
        <Select
          className="w-36"
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as "" | "active" | "inactive")}
        >
          <option value="">الكل</option>
          <option value="active">المفعّلة</option>
          <option value="inactive">غير المفعّلة</option>
        </Select>
      </div>

      <Card>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Sparkles className="w-5 h-5" />}
                title="لا توجد خدمات"
                description="أضف خدمات الغسيل (خارجي، داخلي، تلميع...) لاستخدامها في الفواتير."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الخدمة</TH>
                  <TH>الكود</TH>
                  <TH>النوع</TH>
                  <TH className="text-end">السعر الافتراضي</TH>
                  <TH>العمولة</TH>
                  <TH>الخامات</TH>
                  <TH>الحالة</TH>
                  <TH className="w-20"></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium text-slate-900">{s.name}</TD>
                    <TD><span className="font-mono text-xs text-slate-500">{s.code ?? "—"}</span></TD>
                    <TD>
                      <Badge tone={s.category === "chemical" ? "amber" : s.category === "extra" ? "indigo" : "blue"}>
                        {categoryLabel(s.category)}
                      </Badge>
                    </TD>
                    <TD className="text-end font-medium">
                      {(s.pricingMode ?? "variable") === "variable" && s.defaultPrice <= 0
                        ? "يدوي"
                        : formatCurrency(s.defaultPrice, settings.currency)}
                    </TD>
                    <TD>
                      <Badge tone={s.hasCommission ? "green" : "slate"}>
                        {s.hasCommission ? "نعم" : "لا"}
                      </Badge>
                    </TD>
                    <TD>{s.materials?.length ? `${s.materials.length} خامة` : "—"}</TD>
                    <TD>
                      {canEdit ? (
                        <button
                          onClick={() => updateWashService(s.id, { active: !s.active })}
                          title="تبديل الحالة"
                        >
                          <Badge tone={s.active ? "green" : "slate"}>
                            {s.active ? "مفعّلة" : "غير مفعّلة"}
                          </Badge>
                        </button>
                      ) : (
                        <Badge tone={s.active ? "green" : "slate"}>
                          {s.active ? "مفعّلة" : "غير مفعّلة"}
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2 justify-end">
                        {canEdit ? (
                          <button
                            onClick={() => {
                              setEditing(s);
                              setOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-brand-600 transition-colors"
                            title="تعديل"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            onClick={() => setDelId(s.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <ServiceFormDialog open={open} onClose={() => setOpen(false)} editing={editing} />

      <ConfirmDialog
        open={!!delId}
        onClose={() => setDelId(null)}
        onConfirm={() => {
          if (!delId) return;
          const ok = deleteWashService(delId);
          if (ok) {
            toast.success("تم الحذف");
          } else {
            toast.error("لا يمكن حذف خدمة مستخدمة في فواتير — عطّلها بدلاً من ذلك");
          }
          setDelId(null);
        }}
        title="حذف الخدمة"
        message="هل أنت متأكد من حذف هذه الخدمة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="حذف نهائي"
        variant="danger"
      />
    </>
  );
}
