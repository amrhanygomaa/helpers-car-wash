import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Car,
  Check,
  Clock,
  KeyRound,
  Play,
  Plus,
  Receipt,
  X,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Dialog, ConfirmDialog } from "../components/ui/Dialog";
import { Field, Input, Select } from "../components/ui/Input";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useCarwash } from "../store/CarwashContext";
import { useCatalog } from "../store/CatalogContext";
import { useAuth } from "../store/AuthContext";
import { vehicleLabel } from "./VehiclesPage";
import { formatDateTime, formatDate } from "../lib/format";
import { hasPermission } from "../lib/permissions";
import { todayISO } from "../lib/utils";
import type { QueueStatus, QueueTicket } from "../types";

const STATUS_LABEL: Record<QueueStatus, string> = {
  waiting: "في الانتظار",
  washing: "جاري الغسيل",
  completed: "مكتمل",
  cancelled: "ملغى",
};

const STATUS_TONE: Record<QueueStatus, "amber" | "blue" | "green" | "slate"> = {
  waiting: "amber",
  washing: "blue",
  completed: "green",
  cancelled: "slate",
};

/** Convert an ISO string to the value a datetime-local input expects (local time). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QueuePage() {
  const navigate = useNavigate();
  const {
    queueTickets,
    addQueueTicket,
    setQueueStatus,
    receiveVehicleKey,
    deliverVehicleKey,
    vehicles,
  } = useCarwash();
  const { customers } = useCatalog();
  const { currentUser } = useAuth();
  const toast = useToast();

  const canAdd = hasPermission(currentUser, "queue", "add");
  const canEdit = hasPermission(currentUser, "queue", "edit");
  const canCancel = hasPermission(currentUser, "queue", "cancel");
  const canInvoice = hasPermission(currentUser, "salesInvoices", "add");

  const [open, setOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  // Add-ticket form state
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleText, setVehicleText] = useState("");
  const [arrival, setArrival] = useState(() => toLocalInput(new Date().toISOString()));
  const [delayNote, setDelayNote] = useState("");

  const customerVehicles = useMemo(
    () => vehicles.filter((v) => v.customerId === customerId && !v.archived),
    [vehicles, customerId]
  );

  const today = todayISO();
  const waiting = queueTickets.filter((t) => t.status === "waiting");
  const washing = queueTickets.filter((t) => t.status === "washing");
  const completedToday = queueTickets.filter(
    (t) => t.status === "completed" && t.arrivalTime.slice(0, 10) === today
  );
  const cancelledToday = queueTickets.filter(
    (t) => t.status === "cancelled" && t.arrivalTime.slice(0, 10) === today
  );

  function resetForm() {
    setCustomerId("");
    setName("");
    setPhone("");
    setVehicleId("");
    setVehicleText("");
    setArrival(toLocalInput(new Date().toISOString()));
    setDelayNote("");
  }

  function onPickCustomer(id: string) {
    setCustomerId(id);
    setVehicleId("");
    const c = customers.find((x) => x.id === id);
    if (c) {
      setName(c.name);
      setPhone(c.phone ?? "");
    }
  }

  function handleAdd() {
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error("أدخل اسم العميل");
      return;
    }
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    const label = vehicle ? vehicleLabel(vehicle) : vehicleText.trim() || undefined;
    const ticket = addQueueTicket({
      customerId: customerId || undefined,
      customerName: cleanName,
      phone: phone.trim() || undefined,
      vehicleId: vehicle?.id,
      vehicleLabel: label,
      arrivalTime: arrival ? new Date(arrival).toISOString() : new Date().toISOString(),
      delayNote: delayNote.trim() || undefined,
    });
    toast.success("تمت إضافة السيارة للطابور", `رقم ${ticket.number}`);
    resetForm();
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="طابور الغسيل"
        description="استقبال السيارات وإدارة طابور الغسيل وتتبع المفاتيح"
        actions={
          canAdd ? (
            <Button onClick={() => { resetForm(); setOpen(true); }}>
              <Plus className="w-4 h-4" /> استقبال سيارة
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <QueueColumn
          title={STATUS_LABEL.waiting}
          tone="amber"
          count={waiting.length}
          tickets={waiting}
          empty="لا توجد سيارات في الانتظار"
          render={(t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              canEdit={canEdit}
              canCancel={canCancel}
              canInvoice={canInvoice}
              onStartWash={() => setQueueStatus(t.id, "washing")}
              onComplete={() => setQueueStatus(t.id, "completed")}
              onCancel={() => setCancelId(t.id)}
              onReceiveKey={() => receiveVehicleKey(t.id)}
              onDeliverKey={() => deliverVehicleKey(t.id)}
              onInvoice={() => navigate(`/carwash/new?queue=${t.id}`)}
            />
          )}
        />
        <QueueColumn
          title={STATUS_LABEL.washing}
          tone="blue"
          count={washing.length}
          tickets={washing}
          empty="لا توجد سيارات تحت الغسيل"
          render={(t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              canEdit={canEdit}
              canCancel={canCancel}
              canInvoice={canInvoice}
              onComplete={() => setQueueStatus(t.id, "completed")}
              onCancel={() => setCancelId(t.id)}
              onReceiveKey={() => receiveVehicleKey(t.id)}
              onDeliverKey={() => deliverVehicleKey(t.id)}
              onInvoice={() => navigate(`/carwash/new?queue=${t.id}`)}
            />
          )}
        />
        <QueueColumn
          title={`${STATUS_LABEL.completed} (اليوم)`}
          tone="green"
          count={completedToday.length}
          tickets={completedToday}
          empty="لا توجد سيارات مكتملة اليوم"
          render={(t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              canEdit={canEdit}
              canCancel={false}
              canInvoice={canInvoice && !t.invoiceId}
              onDeliverKey={() => deliverVehicleKey(t.id)}
              onInvoice={() => navigate(`/carwash/new?queue=${t.id}`)}
              onOpenInvoice={t.invoiceId ? () => navigate(`/sales/${t.invoiceId}`) : undefined}
            />
          )}
        />
      </div>

      {cancelledToday.length > 0 ? (
        <div className="mt-4">
          <button
            className="text-xs text-slate-500 hover:text-slate-700"
            onClick={() => setShowCancelled((s) => !s)}
          >
            {showCancelled ? "إخفاء" : "عرض"} الملغاة اليوم ({cancelledToday.length})
          </button>
          {showCancelled ? (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
              {cancelledToday.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">#{t.number} — {t.customerName}</span>
                    <Badge tone="slate">ملغى</Badge>
                  </div>
                  {t.vehicleLabel ? <div className="text-xs text-slate-500 mt-1">{t.vehicleLabel}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Add ticket dialog */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="استقبال سيارة جديدة"
        subtitle="أدخل بيانات العميل والمركبة ووقت الوصول"
        width="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={handleAdd}>إضافة للطابور</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="عميل مسجّل (اختياري)" className="col-span-2">
            <Select value={customerId} onChange={(e) => onPickCustomer(e.target.value)}>
              <option value="">— زائر / بدون حساب —</option>
              {customers.filter((c) => !c.archived).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="اسم العميل" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="رقم الهاتف">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {customerId && customerVehicles.length > 0 ? (
            <Field label="المركبة" className="col-span-2">
              <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">— بدون مركبة —</option>
                {customerVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="المركبة (وصف)" className="col-span-2" hint="مثل: تويوتا كورولا أبيض - أ ب ج 123">
              <Input value={vehicleText} onChange={(e) => setVehicleText(e.target.value)} />
            </Field>
          )}
          <Field label="وقت الوصول">
            <Input type="datetime-local" value={arrival} onChange={(e) => setArrival(e.target.value)} />
          </Field>
          <Field label="ملاحظة تأخير">
            <Input value={delayNote} onChange={(e) => setDelayNote(e.target.value)} placeholder="مثل: العميل سيعود بعد ساعة" />
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={() => {
          if (cancelId) setQueueStatus(cancelId, "cancelled");
          setCancelId(null);
        }}
        title="إلغاء التذكرة"
        message="هل أنت متأكد من إلغاء هذه السيارة من الطابور؟"
        confirmText="إلغاء التذكرة"
        variant="danger"
      />
    </>
  );
}

function QueueColumn({
  title,
  tone,
  count,
  tickets,
  empty,
  render,
}: {
  title: string;
  tone: "amber" | "blue" | "green";
  count: number;
  tickets: QueueTicket[];
  empty: string;
  render: (t: QueueTicket) => React.ReactNode;
}) {
  const sorted = [...tickets].sort((a, b) => a.number - b.number);
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2">{title} <Badge tone={tone}>{count}</Badge></span>} />
      <CardBody className="space-y-2">
        {sorted.length === 0 ? (
          <EmptyState icon={<Car className="w-5 h-5" />} title={empty} />
        ) : (
          sorted.map(render)
        )}
      </CardBody>
    </Card>
  );
}

function TicketCard({
  ticket,
  canEdit,
  canCancel,
  canInvoice,
  onStartWash,
  onComplete,
  onCancel,
  onReceiveKey,
  onDeliverKey,
  onInvoice,
  onOpenInvoice,
}: {
  ticket: QueueTicket;
  canEdit: boolean;
  canCancel: boolean;
  canInvoice: boolean;
  onStartWash?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
  onReceiveKey?: () => void;
  onDeliverKey?: () => void;
  onInvoice?: () => void;
  onOpenInvoice?: () => void;
}) {
  const t = ticket;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-brand-50 text-brand-700 text-sm font-bold">
            {t.number}
          </span>
          <span className="font-medium text-slate-900">{t.customerName}</span>
        </div>
        <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
      </div>

      <div className="text-xs text-slate-500 space-y-0.5">
        {t.vehicleLabel ? <div className="flex items-center gap-1"><Car className="w-3.5 h-3.5" /> {t.vehicleLabel}</div> : null}
        {t.phone ? <div>{t.phone}</div> : null}
        <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> الوصول: {formatDateTime(t.arrivalTime)}</div>
        {t.delayNote ? <div className="text-amber-700">⏳ {t.delayNote}</div> : null}
      </div>

      {/* Key tracking */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {t.keyReceivedAt ? (
          <Badge tone="green">
            <KeyRound className="w-3 h-3" /> استُلم: {t.keyReceivedByName ?? "—"} · {formatDate(t.keyReceivedAt)}
          </Badge>
        ) : canEdit && onReceiveKey ? (
          <Button size="sm" variant="outline" onClick={onReceiveKey}>
            <KeyRound className="w-3.5 h-3.5" /> استلام المفتاح
          </Button>
        ) : null}
        {t.keyDeliveredAt ? (
          <Badge tone="blue">
            <KeyRound className="w-3 h-3" /> سُلّم: {t.keyDeliveredByName ?? "—"} · {formatDate(t.keyDeliveredAt)}
          </Badge>
        ) : t.keyReceivedAt && canEdit && onDeliverKey ? (
          <Button size="sm" variant="outline" onClick={onDeliverKey}>
            <KeyRound className="w-3.5 h-3.5" /> تسليم المفتاح
          </Button>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
        {canEdit && onStartWash ? (
          <Button size="sm" onClick={onStartWash}><Play className="w-3.5 h-3.5" /> ابدأ الغسيل</Button>
        ) : null}
        {canInvoice && onInvoice ? (
          <Button size="sm" variant="outline" onClick={onInvoice}><Receipt className="w-3.5 h-3.5" /> إنشاء فاتورة</Button>
        ) : null}
        {onOpenInvoice ? (
          <Button size="sm" variant="outline" onClick={onOpenInvoice}><Receipt className="w-3.5 h-3.5" /> فتح الفاتورة</Button>
        ) : null}
        {canEdit && onComplete ? (
          <Button size="sm" variant="ghost" onClick={onComplete}><Check className="w-3.5 h-3.5" /> تم</Button>
        ) : null}
        {canCancel && onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-3.5 h-3.5 text-rose-500" /></Button>
        ) : null}
      </div>
    </div>
  );
}
