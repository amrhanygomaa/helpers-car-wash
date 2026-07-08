import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Car,
  Check,
  ChevronDown,
  Clock,
  Droplets,
  GripVertical,
  KeyRound,
  Play,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  X,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Dialog, ConfirmDialog } from "../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useCarwash } from "../store/CarwashContext";
import { useCatalog } from "../store/CatalogContext";
import { useAuth } from "../store/AuthContext";
import { vehicleLabel } from "./VehiclesPage";
import { formatDateTime, formatDate } from "../lib/format";
import { hasPermission } from "../lib/permissions";
import { cn, isValidEgyptPlateNumber, normalizeEgyptPlateNumber, todayISO } from "../lib/utils";
import { printIntakeTicket } from "../lib/print";
import { CustomerFormDialog } from "../features/customers/CustomerFormDialog";
import { CustomerCombobox } from "../features/customers/CustomerCombobox";
import { VehicleFormDialog } from "../features/vehicles/VehicleFormDialog";
import { BrandCombobox } from "../features/vehicles/BrandCombobox";
import { PlateNumberInput } from "../components/ui/PlateNumberInput";
import type { QueueStatus, QueueTicket, Vehicle, WashService } from "../types";

const STATUS_LABEL: Record<QueueStatus, string> = {
  waiting: "في الانتظار",
  in_progress: "جاري الغسيل",
  done: "جاهز للاستلام",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

const STATUS_TONE: Record<QueueStatus, "amber" | "blue" | "green" | "emerald" | "slate"> = {
  waiting: "amber",
  in_progress: "blue",
  done: "green",
  delivered: "emerald",
  cancelled: "slate",
};

const ACTIVE_QUEUE_STATUSES = new Set<QueueStatus>(["waiting", "in_progress"]);
const BOARD_STATUSES: QueueStatus[] = ["waiting", "in_progress", "done", "delivered"];

/** Convert an ISO string to the value a datetime-local input expects (local time). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
}

function parseLocalInput(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickupHourLabel(date: Date): string {
  return date.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
}

function queuePosition(ticket: QueueTicket): number {
  return ticket.queuePosition ?? ticket.number;
}

function sortQueueTickets(tickets: QueueTicket[]): QueueTicket[] {
  return [...tickets].sort((a, b) => queuePosition(a) - queuePosition(b) || a.number - b.number);
}

function ticketBusinessDate(ticket: QueueTicket): string {
  return ticket.businessDate ?? ticket.arrivalTime.slice(0, 10);
}

function ticketServices(ticket: QueueTicket, services: WashService[]): string[] {
  const byId = new Map(services.map((service) => [service.id, service.name]));
  const fromIds = (ticket.serviceIds ?? []).map((id) => byId.get(id)).filter(Boolean) as string[];
  return fromIds.length ? fromIds : ticket.serviceNames ?? [];
}

function carsAheadForTicket(ticket: QueueTicket, tickets: QueueTicket[]): number {
  const active = sortQueueTickets(tickets.filter((t) => ACTIVE_QUEUE_STATUSES.has(t.status)));
  const index = active.findIndex((t) => t.id === ticket.id);
  return Math.max(0, index);
}

function isPickupLate(ticket: QueueTicket): boolean {
  if (!ticket.requestedPickupAt || ticket.status !== "waiting") return false;
  const pickup = new Date(ticket.requestedPickupAt);
  return !Number.isNaN(pickup.getTime()) && pickup.getTime() < Date.now();
}

export function QueuePage() {
  const navigate = useNavigate();
  const {
    queueTickets,
    addQueueTickets,
    setQueueStatus,
    receiveVehicleKey,
    deliverVehicleKey,
    reorderQueueTicket,
    requeueTicket,
    vehicles,
    washServices,
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
  const [draggingTicketId, setDraggingTicketId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<QueueStatus | null>(null);

  // Add-ticket form state
  const [customerId, setCustomerId] = useState("");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([""]);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerDialogPrefill, setCustomerDialogPrefill] = useState("");
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  // Walk-in customer who isn't saved as a registered customer.
  const [guest, setGuest] = useState<{ name: string; phone: string } | null>(null);
  const [guestVehicle, setGuestVehicle] = useState({ brand: "", model: "", plateNumber: "", color: "" });
  const [arrival, setArrival] = useState(() => nowLocalInput());
  const [requestedPickupAt, setRequestedPickupAt] = useState("");
  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);
  const [note, setNote] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [keyReceived, setKeyReceived] = useState(true);
  const [printOnAdd, setPrintOnAdd] = useState(true);

  const activeServices = useMemo(
    () => washServices.filter((s) => s.active).sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)),
    [washServices]
  );

  const customerVehicles = useMemo(
    () => vehicles.filter((v) => v.customerId === customerId && !v.archived),
    [vehicles, customerId]
  );
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId && !customer.archived),
    [customers, customerId]
  );
  const pickupHourOptions = useMemo(() => {
    const arrivalDate = parseLocalInput(arrival);
    if (!arrivalDate) return [];

    const firstHour = new Date(arrivalDate);
    firstHour.setHours(0, 0, 0, 0);

    return Array.from({ length: 48 }, (_, index) => {
      const date = new Date(firstHour);
      date.setHours(firstHour.getHours() + index);
      return {
        value: toLocalInput(date.toISOString()),
        label: pickupHourLabel(date),
        disabled: date.getTime() <= arrivalDate.getTime(),
      };
    });
  }, [arrival]);
  const selectedPickupHourLabel = useMemo(
    () => pickupHourOptions.find((option) => option.value === requestedPickupAt)?.label,
    [pickupHourOptions, requestedPickupAt]
  );

  const today = todayISO();
  const waiting = queueTickets.filter((t) => t.status === "waiting");
  const inProgress = queueTickets.filter((t) => t.status === "in_progress");
  const doneToday = queueTickets.filter((t) => t.status === "done" && ticketBusinessDate(t) === today);
  const deliveredToday = queueTickets.filter((t) => t.status === "delivered" && ticketBusinessDate(t) === today);
  const cancelledToday = queueTickets.filter((t) => t.status === "cancelled" && ticketBusinessDate(t) === today);
  const draggingTicket = useMemo(
    () => queueTickets.find((ticket) => ticket.id === draggingTicketId),
    [queueTickets, draggingTicketId]
  );

  function resetForm() {
    setCustomerId("");
    setSelectedVehicleIds([""]);
    setRequestedPickupAt("");
    setPickupDropdownOpen(false);
    setNote("");
    setServiceIds([]);
    setKeyReceived(true);
    setPrintOnAdd(true);
  }

  function openIntakeDialog() {
    resetForm();
    setArrival(nowLocalInput());
    setOpen(true);
  }

  function onPickCustomer(id: string) {
    setCustomerId(id);
    setSelectedVehicleIds([""]);
  }

  function onPickVehicle(index: number, id: string) {
    setSelectedVehicleIds((current) => current.map((vehicleId, i) => (i === index ? id : vehicleId)));
  }

  function addVehicleSlot() {
    if (!customerId) {
      toast.error("اختر العميل أولاً");
      return;
    }
    setSelectedVehicleIds((current) => [...current, ""]);
  }

  function removeVehicleSlot(index: number) {
    setSelectedVehicleIds((current) => current.filter((_, i) => i !== index));
  }

  function selectCreatedVehicle(id: string) {
    setSelectedVehicleIds((current) => {
      const emptyIndex = current.findIndex((vehicleId) => !vehicleId);
      if (emptyIndex < 0) return [...current, id];
      return current.map((vehicleId, index) => (index === emptyIndex ? id : vehicleId));
    });
  }

  function toggleService(serviceId: string) {
    setServiceIds((selected) =>
      selected.includes(serviceId) ? selected.filter((id) => id !== serviceId) : [...selected, serviceId]
    );
  }

  async function handlePrint(ticket: QueueTicket) {
    const result = await printIntakeTicket({
      ticket,
      carsAhead: carsAheadForTicket(ticket, queueTickets),
      services: ticketServices(ticket, washServices),
    });
    if (!result.ok) toast.error("تعذر فتح الطباعة", result.error);
  }

  function clearDragState() {
    setDraggingTicketId(null);
    setDragOverStatus(null);
  }

  function onTicketDragStart(event: DragEvent<HTMLElement>, ticket: QueueTicket) {
    if (!canEdit || ticket.status === "cancelled") {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ticket.id);
    setDraggingTicketId(ticket.id);
  }

  function onColumnDragOver(event: DragEvent<HTMLElement>, status: QueueStatus) {
    if (!canEdit || !draggingTicket || !BOARD_STATUSES.includes(status)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStatus(status);
  }

  function onColumnDrop(event: DragEvent<HTMLElement>, status: QueueStatus) {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData("text/plain") || draggingTicketId;
    const ticket = queueTickets.find((item) => item.id === ticketId);
    clearDragState();
    if (!ticket || !canEdit || ticket.status === status || ticket.status === "cancelled") return;

    if (status === "delivered") {
      deliverVehicleKey(ticket.id);
    } else {
      setQueueStatus(ticket.id, status);
    }
    toast.success("تم تحديث حالة السيارة", `${ticket.customerName} - ${STATUS_LABEL[status]}`);
  }

  async function handleAdd() {
    if (!selectedCustomer) {
      toast.error("اختر عميلاً مسجلاً");
      return;
    }
    if (selectedVehicleIds.some((id) => !id)) {
      toast.error("اختر مركبة لكل خانة أو احذف الخانة الفارغة");
      return;
    }
    if (new Set(selectedVehicleIds).size !== selectedVehicleIds.length) {
      toast.error("لا يمكن إضافة نفس المركبة مرتين");
      return;
    }

    const selectedVehicles = selectedVehicleIds
      .map((id) => customerVehicles.find((vehicle) => vehicle.id === id))
      .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
    if (selectedVehicles.length !== selectedVehicleIds.length || selectedVehicles.length === 0) {
      toast.error("اختر مركبة مسجلة للعميل");
      return;
    }
    const arrivalDate = parseLocalInput(arrival);
    const pickupDate = requestedPickupAt ? parseLocalInput(requestedPickupAt) : null;
    if (pickupDate && arrivalDate && pickupDate.getTime() <= arrivalDate.getTime()) {
      toast.error("وقت الاستلام لازم يكون بعد وقت الوصول");
      return;
    }

    const selectedServices = activeServices.filter((service) => serviceIds.includes(service.id));
    const keyTime = keyReceived ? new Date().toISOString() : undefined;
    const tickets = addQueueTickets(
      selectedVehicles.map((vehicle) => ({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        phone: selectedCustomer.phone || undefined,
        vehicleId: vehicle.id,
        vehicleBrand: vehicle.brand,
        vehicleLabel: vehicleLabel(vehicle),
        serviceIds: selectedServices.map((service) => service.id),
        serviceNames: selectedServices.map((service) => service.name),
        arrivalTime: arrival ? new Date(arrival).toISOString() : new Date().toISOString(),
        requestedPickupAt: requestedPickupAt ? new Date(requestedPickupAt).toISOString() : undefined,
        note: note.trim() || undefined,
        delayNote: note.trim() || undefined,
        keyReceived,
        keyReceivedAt: keyTime,
        keyReceivedBy: keyReceived ? currentUser?.id : undefined,
        keyReceivedByName: keyReceived ? currentUser?.name : undefined,
      }))
    );

    if (printOnAdd) {
      const carsAlreadyWaiting = queueTickets.filter((ticket) => ACTIVE_QUEUE_STATUSES.has(ticket.status)).length;
      for (const [index, ticket] of tickets.entries()) {
        const result = await printIntakeTicket({
          ticket,
          carsAhead: carsAlreadyWaiting + index,
          services: selectedServices.map((service) => service.name),
        });
        if (!result.ok) toast.error("تعذر فتح الطباعة", result.error);
      }
    }

    const ticketNumbers = tickets.map((ticket) => `#${ticket.number}`).join("، ");
    toast.success(
      tickets.length > 1 ? `تمت إضافة ${tickets.length} سيارات للطابور` : "تمت إضافة السيارة للطابور",
      ticketNumbers
    );
    resetForm();
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="طابور الغسيل"
        description="لوحة تشغيل الدور ومراحل الغسيل وتتبع المفاتيح وتذاكر الاستلام"
        actions={
          canAdd ? (
            <Button onClick={openIntakeDialog}>
              <Plus className="w-4 h-4" /> استقبال سيارة
            </Button>
          ) : null
        }
      />

      <QueueWashMotion
        waiting={waiting.length}
        inProgress={inProgress.length}
        ready={doneToday.length}
        delivered={deliveredToday.length}
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <QueueColumn
          status="waiting"
          title={STATUS_LABEL.waiting}
          tone="amber"
          count={waiting.length}
          tickets={waiting}
          empty="لا توجد سيارات في الانتظار"
          canDrop={canEdit}
          isDragging={Boolean(draggingTicketId)}
          isDropTarget={dragOverStatus === "waiting"}
          onDragOver={onColumnDragOver}
          onDragLeave={() => setDragOverStatus((status) => (status === "waiting" ? null : status))}
          onDrop={onColumnDrop}
          render={(t, index, list) => (
            <TicketCard
              key={t.id}
              ticket={t}
              draggable={canEdit}
              isDragging={draggingTicketId === t.id}
              services={ticketServices(t, washServices)}
              carsAhead={carsAheadForTicket(t, queueTickets)}
              canEdit={canEdit}
              canCancel={canCancel}
              canInvoice={canInvoice && !t.invoiceId}
              canMoveUp={index > 0}
              canMoveDown={index < list.length - 1}
              onMoveUp={() => reorderQueueTicket(t.id, "up")}
              onMoveDown={() => reorderQueueTicket(t.id, "down")}
              onStartWash={() => setQueueStatus(t.id, "in_progress")}
              onCancel={() => setCancelId(t.id)}
              onReceiveKey={() => receiveVehicleKey(t.id)}
              onDeliverKey={() => deliverVehicleKey(t.id)}
              onInvoice={() => navigate(`/carwash/new?queue=${t.id}`)}
              onPrint={() => handlePrint(t)}
              onRequeue={() => requeueTicket(t.id)}
              onDragStart={(event) => onTicketDragStart(event, t)}
              onDragEnd={clearDragState}
            />
          )}
        />
        <QueueColumn
          status="in_progress"
          title={STATUS_LABEL.in_progress}
          tone="blue"
          count={inProgress.length}
          tickets={inProgress}
          empty="لا توجد سيارات تحت الغسيل"
          canDrop={canEdit}
          isDragging={Boolean(draggingTicketId)}
          isDropTarget={dragOverStatus === "in_progress"}
          onDragOver={onColumnDragOver}
          onDragLeave={() => setDragOverStatus((status) => (status === "in_progress" ? null : status))}
          onDrop={onColumnDrop}
          render={(t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              draggable={canEdit}
              isDragging={draggingTicketId === t.id}
              services={ticketServices(t, washServices)}
              carsAhead={carsAheadForTicket(t, queueTickets)}
              canEdit={canEdit}
              canCancel={canCancel}
              canInvoice={canInvoice && !t.invoiceId}
              onComplete={() => setQueueStatus(t.id, "done")}
              onCancel={() => setCancelId(t.id)}
              onReceiveKey={() => receiveVehicleKey(t.id)}
              onDeliverKey={() => deliverVehicleKey(t.id)}
              onInvoice={() => navigate(`/carwash/new?queue=${t.id}`)}
              onPrint={() => handlePrint(t)}
              onRequeue={() => requeueTicket(t.id)}
              onDragStart={(event) => onTicketDragStart(event, t)}
              onDragEnd={clearDragState}
            />
          )}
        />
        <QueueColumn
          status="done"
          title={`${STATUS_LABEL.done} (اليوم)`}
          tone="green"
          count={doneToday.length}
          tickets={doneToday}
          empty="لا توجد سيارات جاهزة اليوم"
          canDrop={canEdit}
          isDragging={Boolean(draggingTicketId)}
          isDropTarget={dragOverStatus === "done"}
          onDragOver={onColumnDragOver}
          onDragLeave={() => setDragOverStatus((status) => (status === "done" ? null : status))}
          onDrop={onColumnDrop}
          render={(t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              draggable={canEdit}
              isDragging={draggingTicketId === t.id}
              services={ticketServices(t, washServices)}
              carsAhead={carsAheadForTicket(t, queueTickets)}
              canEdit={canEdit}
              canCancel={false}
              canInvoice={canInvoice && !t.invoiceId}
              onDeliverKey={() => deliverVehicleKey(t.id)}
              onInvoice={() => navigate(`/carwash/new?queue=${t.id}`)}
              onOpenInvoice={t.invoiceId ? () => navigate(`/sales/${t.invoiceId}`) : undefined}
              onPrint={() => handlePrint(t)}
              onRequeue={() => requeueTicket(t.id)}
              onDragStart={(event) => onTicketDragStart(event, t)}
              onDragEnd={clearDragState}
            />
          )}
        />
        <QueueColumn
          status="delivered"
          title={`${STATUS_LABEL.delivered} (اليوم)`}
          tone="emerald"
          count={deliveredToday.length}
          tickets={deliveredToday}
          empty="لا توجد سيارات مسلّمة اليوم"
          canDrop={canEdit}
          isDragging={Boolean(draggingTicketId)}
          isDropTarget={dragOverStatus === "delivered"}
          onDragOver={onColumnDragOver}
          onDragLeave={() => setDragOverStatus((status) => (status === "delivered" ? null : status))}
          onDrop={onColumnDrop}
          render={(t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              draggable={canEdit}
              isDragging={draggingTicketId === t.id}
              services={ticketServices(t, washServices)}
              carsAhead={carsAheadForTicket(t, queueTickets)}
              canEdit={canEdit}
              canCancel={false}
              canInvoice={false}
              onOpenInvoice={t.invoiceId ? () => navigate(`/sales/${t.invoiceId}`) : undefined}
              onPrint={() => handlePrint(t)}
              onDragStart={(event) => onTicketDragStart(event, t)}
              onDragEnd={clearDragState}
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">#{t.number} - {t.customerName}</span>
                    <Badge tone="slate">ملغى</Badge>
                  </div>
                  {t.vehicleLabel ? <div className="text-xs text-slate-500 mt-1">{t.vehicleLabel}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div>استقبال سيارة جديدة</div>
              <div className="mt-0.5 text-xs font-normal text-slate-500">
                بيانات العميل والسيارة والخدمات المطلوبة وتذكرة الاستلام
              </div>
            </div>
            <div className="w-full sm:w-72">
              <div className="mb-1 text-xs font-medium text-slate-600">وقت الوصول</div>
              <Input type="datetime-local" value={arrival} readOnly className="bg-slate-50 text-slate-600" />
            </div>
          </div>
        }
        width="2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={handleAdd}>إضافة للطابور</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <Field label="العميل المسجّل" required className="flex-1">
                <Select value={customerId} onChange={(e) => onPickCustomer(e.target.value)}>
                  <option value="">اختر العميل</option>
                  {customers.filter((customer) => !customer.archived).map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </Select>
              </Field>
              <Button type="button" variant="outline" onClick={() => setCustomerDialogOpen(true)}>
                <Plus className="w-4 h-4" /> عميل جديد
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="اسم العميل">
                <Input value={selectedCustomer?.name ?? ""} readOnly className="bg-white text-slate-600" />
              </Field>
              <Field label="رقم الهاتف">
                <Input value={selectedCustomer?.phone ?? ""} readOnly className="bg-white text-slate-600" />
              </Field>
            </div>
          </div>

          <div className="md:col-span-2 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">مركبات الاستقبال</div>
                <div className="text-xs text-slate-500">اختر مركبة محفوظة من ملف العميل لكل تذكرة غسيل.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!customerId}
                  onClick={() => setVehicleDialogOpen(true)}
                >
                  <Plus className="w-4 h-4" /> مركبة جديدة
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!customerId || selectedVehicleIds.some((id) => !id)}
                  onClick={addVehicleSlot}
                >
                  <Plus className="w-4 h-4" /> سيارة أخرى للغسيل
                </Button>
              </div>
            </div>

            {selectedVehicleIds.map((selectedId, index) => {
              const vehicle = customerVehicles.find((item) => item.id === selectedId);
              return (
                <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-brand-700">{index + 1}</span>
                      السيارة {index + 1}
                    </div>
                    {selectedVehicleIds.length > 1 ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeVehicleSlot(index)}>
                        <X className="w-4 h-4" /> حذف
                      </Button>
                    ) : null}
                  </div>
                  <Field label="المركبة المحفوظة" required>
                    <Select
                      value={selectedId}
                      disabled={!customerId}
                      onChange={(event) => onPickVehicle(index, event.target.value)}
                    >
                      <option value="">{customerId ? "اختر المركبة" : "اختر العميل أولاً"}</option>
                      {customerVehicles.map((item) => (
                        <option
                          key={item.id}
                          value={item.id}
                          disabled={selectedVehicleIds.some((id, slotIndex) => slotIndex !== index && id === item.id)}
                        >
                          {vehicleLabel(item)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {customerId && customerVehicles.length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      لا توجد مركبات محفوظة لهذا العميل. استخدم زر «مركبة جديدة» لإضافتها إلى ملفه.
                    </div>
                  ) : null}
                  {vehicle ? (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <Field label="الماركة">
                        <Input value={vehicle.brand} readOnly className="bg-slate-50 text-slate-600" />
                      </Field>
                      <Field label="الموديل">
                        <Input value={vehicle.model ?? ""} readOnly className="bg-slate-50 text-slate-600" />
                      </Field>
                      <Field label="رقم اللوحة">
                        <Input value={vehicle.plateNumber} readOnly className="bg-slate-50 text-slate-600 font-mono" />
                      </Field>
                      <Field label="اللون">
                        <Input value={vehicle.color ?? ""} readOnly className="bg-slate-50 text-slate-600" />
                      </Field>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <Field label="موعد الاستلام المطلوب" hint="اختر ساعة بعد وقت الوصول">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickupDropdownOpen((isOpen) => !isOpen)}
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700",
                  "focus-ring"
                )}
              >
                <span className={selectedPickupHourLabel ? "text-slate-900" : "text-slate-500"}>
                  {selectedPickupHourLabel ?? "اختياري - اختر الساعة"}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-slate-500 transition", pickupDropdownOpen && "rotate-180")} />
              </button>
              {pickupDropdownOpen ? (
                <div className="absolute z-30 mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                    {pickupHourOptions.map((option) => {
                      const selected = requestedPickupAt === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={option.disabled}
                          onClick={() => {
                            setRequestedPickupAt(option.value);
                            setPickupDropdownOpen(false);
                          }}
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-xs font-semibold transition",
                            selected
                              ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                              : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50",
                            option.disabled &&
                              "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-300 hover:border-slate-100 hover:bg-slate-100"
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </Field>
          <Field label="الخدمات" className="md:col-span-2">
            {activeServices.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                لا توجد خدمات مفعّلة. أضف الخدمات من صفحة الخدمات أولاً.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {activeServices.map((service) => (
                  <label
                    key={service.id}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={serviceIds.includes(service.id)}
                      onChange={() => toggleService(service.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="min-w-0 truncate">{service.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>
          <Field label="ملاحظة" className="md:col-span-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: العميل مستعجل / خدش في الباب الخلفي" />
          </Field>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={keyReceived}
              onChange={(e) => setKeyReceived(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            تم استلام المفتاح
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={printOnAdd}
              onChange={(e) => setPrintOnAdd(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            طباعة تذكرة الاستقبال
          </label>
        </div>
      </Dialog>

      <CustomerFormDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        onCreated={(customer) => {
          setCustomerId(customer.id);
          setSelectedVehicleIds([""]);
        }}
      />
      <VehicleFormDialog
        open={vehicleDialogOpen}
        onClose={() => setVehicleDialogOpen(false)}
        customerId={customerId}
        customers={customers.filter((customer) => !customer.archived)}
        onCreated={(vehicle) => selectCreatedVehicle(vehicle.id)}
      />

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
  status,
  title,
  tone,
  count,
  tickets,
  empty,
  canDrop,
  isDragging,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  render,
}: {
  status: QueueStatus;
  title: string;
  tone: "amber" | "blue" | "green" | "emerald";
  count: number;
  tickets: QueueTicket[];
  empty: string;
  canDrop: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragOver: (event: DragEvent<HTMLElement>, status: QueueStatus) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>, status: QueueStatus) => void;
  render: (t: QueueTicket, index: number, sorted: QueueTicket[]) => ReactNode;
}) {
  const sorted = sortQueueTickets(tickets);
  return (
    <section
      className={cn(
        "queue-board-column rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm transition-all",
        isDragging && canDrop ? "border-dashed" : "",
        isDropTarget ? "is-drop-target border-brand-300 bg-brand-50/60 shadow-md" : ""
      )}
      onDragOver={(event) => onDragOver(event, status)}
      onDragLeave={onDragLeave}
      onDrop={(event) => onDrop(event, status)}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 text-sm font-semibold text-slate-900">{title}</div>
        <Badge tone={tone}>{count}</Badge>
      </div>
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <EmptyState icon={<Car className="w-5 h-5" />} title={empty} />
        ) : (
          sorted.map((ticket, index) => render(ticket, index, sorted))
        )}
      </div>
    </section>
  );
}

function TicketCard({
  ticket,
  draggable,
  isDragging,
  services,
  carsAhead,
  canEdit,
  canCancel,
  canInvoice,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onStartWash,
  onComplete,
  onCancel,
  onReceiveKey,
  onDeliverKey,
  onInvoice,
  onOpenInvoice,
  onPrint,
  onRequeue,
  onDragStart,
  onDragEnd,
}: {
  ticket: QueueTicket;
  draggable: boolean;
  isDragging: boolean;
  services: string[];
  carsAhead: number;
  canEdit: boolean;
  canCancel: boolean;
  canInvoice: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onStartWash?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
  onReceiveKey?: () => void;
  onDeliverKey?: () => void;
  onInvoice?: () => void;
  onOpenInvoice?: () => void;
  onPrint?: () => void;
  onRequeue?: () => void;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
}) {
  const t = ticket;
  const pickupLate = isPickupLate(t);
  const keyIsReceived = Boolean(t.keyReceived || t.keyReceivedAt);

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "queue-ticket-card rounded-lg border border-slate-200 bg-white p-3 space-y-2 shadow-sm",
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        isDragging ? "is-dragging" : ""
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {draggable ? (
            <span className="grid h-8 w-4 shrink-0 place-items-center text-slate-300" aria-hidden="true">
              <GripVertical className="h-4 w-4" />
            </span>
          ) : null}
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-sm font-bold text-brand-700">
            {t.number}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">{t.customerName}</div>
            <div className="text-[11px] text-slate-400">سيارات قبله: {carsAhead}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          {t.missedTurn ? <Badge tone="orange">معاد ترتيبه</Badge> : null}
        </div>
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        {t.vehicleLabel || t.vehicleBrand ? (
          <div className="flex items-center gap-1">
            <Car className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{t.vehicleLabel ?? t.vehicleBrand}</span>
          </div>
        ) : null}
        {t.phone ? <div>{t.phone}</div> : null}
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>الوصول: {formatDateTime(t.arrivalTime)}</span>
        </div>
        {t.requestedPickupAt ? (
          <div className={pickupLate ? "text-amber-700" : undefined}>
            الاستلام المطلوب: {formatDateTime(t.requestedPickupAt)}
          </div>
        ) : null}
        {services.length ? <div className="text-slate-600">الخدمات: {services.join("، ")}</div> : null}
        {t.note ? <div className="text-amber-700">{t.note}</div> : null}
        {t.damageAreas && t.damageAreas.length ? (
          <div className="text-rose-600">⚠ أضرار مسبقة: {t.damageAreas.join("، ")}</div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {keyIsReceived ? (
          <Badge tone="green">
            <KeyRound className="h-3 w-3" /> استُلم: {t.keyReceivedByName ?? "—"} · {formatDate(t.keyReceivedAt ?? t.arrivalTime)}
          </Badge>
        ) : canEdit && onReceiveKey ? (
          <Button size="sm" variant="outline" onClick={onReceiveKey}>
            <KeyRound className="h-3.5 w-3.5" /> استلام المفتاح
          </Button>
        ) : null}
        {t.keyDeliveredAt ? (
          <Badge tone="blue">
            <KeyRound className="h-3 w-3" /> سُلّم: {t.keyDeliveredByName ?? "—"} · {formatDate(t.keyDeliveredAt)}
          </Badge>
        ) : keyIsReceived && canEdit && onDeliverKey && t.status === "done" ? (
          <Button size="sm" variant="outline" onClick={onDeliverKey}>
            <KeyRound className="h-3.5 w-3.5" /> تسليم المفتاح
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
        {canEdit && onMoveUp ? (
          <Button size="icon" variant="outline" onClick={onMoveUp} disabled={!canMoveUp} title="تحريك لأعلى">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {canEdit && onMoveDown ? (
          <Button size="icon" variant="outline" onClick={onMoveDown} disabled={!canMoveDown} title="تحريك لأسفل">
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {canEdit && onStartWash ? (
          <Button size="sm" onClick={onStartWash}><Play className="h-3.5 w-3.5" /> ابدأ</Button>
        ) : null}
        {canEdit && onComplete ? (
          <Button size="sm" variant="success" onClick={onComplete}><Check className="h-3.5 w-3.5" /> جاهز</Button>
        ) : null}
        {canInvoice && onInvoice ? (
          <Button size="sm" variant="outline" onClick={onInvoice}><Receipt className="h-3.5 w-3.5" /> فاتورة</Button>
        ) : null}
        {onOpenInvoice ? (
          <Button size="sm" variant="outline" onClick={onOpenInvoice}><Receipt className="h-3.5 w-3.5" /> فتح</Button>
        ) : null}
        {onPrint ? (
          <Button size="icon" variant="ghost" onClick={onPrint} title="طباعة تذكرة الاستقبال">
            <Printer className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {canEdit && onRequeue && t.status !== "delivered" ? (
          <Button size="icon" variant="ghost" onClick={onRequeue} title="إرجاع لآخر الطابور">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {canCancel && onCancel ? (
          <Button size="icon" variant="ghost" onClick={onCancel} title="إلغاء">
            <X className="h-3.5 w-3.5 text-rose-500" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function QueueWashMotion({
  waiting,
  inProgress,
  ready,
  delivered,
}: {
  waiting: number;
  inProgress: number;
  ready: number;
  delivered: number;
}) {
  return (
    <section className="queue-wash-strip mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="relative min-h-[96px] px-4 py-4">
        <div className="queue-wash-track" aria-hidden="true">
          <div className="queue-wash-water" />
          <div className="queue-wash-car">
            <Car className="h-7 w-7" />
          </div>
          <Droplets className="queue-wash-drop queue-wash-drop-a h-5 w-5" />
          <Droplets className="queue-wash-drop queue-wash-drop-b h-4 w-4" />
          <Droplets className="queue-wash-drop queue-wash-drop-c h-4 w-4" />
        </div>
        <div className="relative z-10 grid grid-cols-2 gap-2 md:grid-cols-4">
          <WashMetric label="انتظار" value={waiting} tone="amber" />
          <WashMetric label="تحت الغسيل" value={inProgress} tone="blue" />
          <WashMetric label="جاهزة" value={ready} tone="green" />
          <WashMetric label="سُلّمت" value={delivered} tone="emerald" />
        </div>
      </div>
    </section>
  );
}

function WashMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "green" | "emerald";
}) {
  const toneClass: Record<typeof tone, string> = {
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
    green: "text-green-700 bg-green-50 border-green-200",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
  };

  return (
    <div className={cn("rounded-lg border px-3 py-2", toneClass[tone])}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="text-xl font-bold leading-tight">{value}</div>
    </div>
  );
}
