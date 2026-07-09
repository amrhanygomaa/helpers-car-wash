import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Phone,
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
import { formatDateTime, formatDate } from "../lib/format";
import { hasPermission } from "../lib/permissions";
import { cn, todayISO, localISODate, vehicleLabel, isValidEgyptPhoneNumber, PHONE_VALIDATION_ERROR } from "../lib/utils";
import { printIntakeTicket } from "../lib/print";
import { CustomerFormDialog } from "../features/customers/CustomerFormDialog";
import { CustomerCombobox } from "../features/customers/CustomerCombobox";
import { VehicleFormDialog } from "../features/vehicles/VehicleFormDialog";
import { BrandCombobox } from "../features/vehicles/BrandCombobox";
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
  if (ticket.businessDate) return ticket.businessDate;
  const d = new Date(ticket.arrivalTime);
  return Number.isNaN(d.getTime()) ? ticket.arrivalTime.slice(0, 10) : localISODate(d);
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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const { customers, addCustomer } = useCatalog();
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
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([""]);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerDialogPrefill, setCustomerDialogPrefill] = useState("");
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [arrival, setArrival] = useState(() => nowLocalInput());
  const [requestedPickupAt, setRequestedPickupAt] = useState("");
  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);
  const [note, setNote] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [keyReceived, setKeyReceived] = useState(true);
  const [printOnAdd, setPrintOnAdd] = useState(true);

  // Guest Mode states
  const [isGuest, setIsGuest] = useState(false);
  const [guestBrand, setGuestBrand] = useState("");
  const [guestModel, setGuestModel] = useState("");
  const [guestPlate, setGuestPlate] = useState("");
  const [guestColor, setGuestColor] = useState("");

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
    setCustomerName("");
    setCustomerPhone("");
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

  useEffect(() => {
    if (!canAdd) return;
    if (searchParams.get("new") !== "1") return;
    openIntakeDialog();
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function onPickCustomer(id: string) {
    setCustomerId(id);
    const customer = customers.find((item) => item.id === id && !item.archived);
    setCustomerName(customer?.name ?? "");
    setCustomerPhone(customer?.phone ?? "");
    const vList = vehicles.filter((v) => v.customerId === id && !v.archived);
    if (vList.length > 0) {
      setSelectedVehicleIds([vList[0].id]);
    } else {
      setSelectedVehicleIds([""]);
    }
  }

  /** "تسجيل كزائر" — skips the add-customer dialog and switches straight to Guest Mode. */
  function quickRegisterGuest(query: string) {
    const trimmed = query.trim();
    const isPhoneLike = /^[0-9]+$/.test(trimmed);
    if (isPhoneLike && !isValidEgyptPhoneNumber(trimmed)) {
      toast.error("رقم الهاتف غير صحيح", PHONE_VALIDATION_ERROR);
      return;
    }
    setIsGuest(true);
    setCustomerId("");
    setCustomerName("ضيف");
    setCustomerPhone(isPhoneLike ? trimmed : "");
    setGuestBrand("");
    setGuestModel("");
    setGuestPlate("");
    setGuestColor("");
    setSelectedVehicleIds(["guest-slot"]);
    toast.success("تم تفعيل وضع الضيف");
  }

  function openAddCustomerDialog(query: string) {
    setCustomerDialogPrefill(query);
    setCustomerDialogOpen(true);
  }

  function ensureCustomerFromForm() {
    if (selectedCustomer) return selectedCustomer;

    const name = customerName.trim() || (customerPhone.trim() ? "ضيف" : "");
    const phone = customerPhone.trim();
    if (!name) {
      toast.error("اختر عميلاً مسجلاً أو أدخل بيانات العميل");
      return null;
    }

    const existing = customers.find((customer) => {
      if (customer.archived) return false;
      const samePhone = phone && customer.phone?.trim() === phone;
      const sameName = customer.name.trim() === name;
      return Boolean(samePhone || sameName);
    });
    const customer = existing ?? addCustomer({ name, phone: phone || undefined });
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? "");
    return customer;
  }

  function openVehicleDialog() {
    if (!ensureCustomerFromForm()) return;
    setVehicleDialogOpen(true);
  }

  function onPickVehicle(index: number, id: string) {
    setSelectedVehicleIds((current) => current.map((vehicleId, i) => (i === index ? id : vehicleId)));
  }

  function addVehicleSlot() {
    if (!ensureCustomerFromForm()) {
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
    let ticketsData;

    if (isGuest) {
      const name = customerName.trim() || "ضيف";
      const phone = customerPhone.trim();

      const make = [guestBrand.trim(), guestModel.trim()].filter(Boolean).join(" ").trim() || "سيارة";
      const plate = guestPlate.trim();
      const color = guestColor.trim();
      const label = [
        make,
        color ? `(${color})` : "",
        plate ? `[${plate}]` : ""
      ].filter(Boolean).join(" · ").trim();

      const arrivalDate = parseLocalInput(arrival);
      const pickupDate = requestedPickupAt ? parseLocalInput(requestedPickupAt) : null;
      if (pickupDate && arrivalDate && pickupDate.getTime() <= arrivalDate.getTime()) {
        toast.error("وقت الاستلام لازم يكون بعد وقت الوصول");
        return;
      }

      const selectedServices = activeServices.filter((service) => serviceIds.includes(service.id));
      const keyTime = keyReceived ? new Date().toISOString() : undefined;

      ticketsData = [{
        customerName: name,
        phone: phone || undefined,
        vehicleBrand: guestBrand.trim(),
        vehicleLabel: label || guestBrand.trim(),
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
      }];
    } else {
      const effectiveCustomer = ensureCustomerFromForm();
      if (!effectiveCustomer) {
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
        .map((id) => vehicles.find((vehicle) => vehicle.customerId === effectiveCustomer.id && !vehicle.archived && vehicle.id === id))
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

      ticketsData = selectedVehicles.map((vehicle) => ({
        customerId: effectiveCustomer.id,
        customerName: effectiveCustomer.name,
        phone: effectiveCustomer.phone || undefined,
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
      }));
    }

    const selectedServices = activeServices.filter((service) => serviceIds.includes(service.id));
    const tickets = addQueueTickets(ticketsData);

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between font-normal">
            <div>
              <div className="font-semibold text-slate-900">استقبال سيارة جديدة</div>
              <div className="mt-0.5 text-xs font-normal text-slate-500">
                بيانات العميل والسيارة والخدمات المطلوبة وتذكرة الاستلام
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="w-full sm:w-52">
                <div className="mb-1 text-xs font-medium text-slate-600">وقت الوصول</div>
                <Input type="datetime-local" value={arrival} readOnly className="bg-slate-50 text-slate-600 h-9" />
              </div>
              <div className="w-full sm:w-60">
                <div className="mb-1 text-xs font-medium text-slate-600">موعد الاستلام المطلوب</div>
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
                    <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto">
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
                                "flex h-8 items-center justify-center rounded-lg border text-xs font-semibold transition",
                                selected
                                  ? "border-brand-600 bg-brand-600 text-white shadow-sm font-normal"
                                  : option.disabled
                                    ? "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed font-normal"
                                    : "border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50 text-slate-600 font-normal"
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
              </div>
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
          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <Field label="العميل المسجّل" className="flex-1">
                <CustomerCombobox
                  customers={customers.filter((customer) => !customer.archived)}
                  selectedCustomer={isGuest ? undefined : selectedCustomer}
                  onPick={(customer) => {
                    setIsGuest(false);
                    onPickCustomer(customer.id);
                  }}
                  onClear={() => onPickCustomer("")}
                  onAddNew={openAddCustomerDialog}
                  onGuest={quickRegisterGuest}
                  disabled={isGuest}
                />
              </Field>
              <Button
                type="button"
                variant={isGuest ? "primary" : "outline"}
                size="lg"
                className={cn(
                  "font-semibold rounded-lg transition-all",
                  isGuest
                    ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600 active:bg-amber-800 shadow-sm"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                )}
                onClick={() => {
                  if (isGuest) {
                    setIsGuest(false);
                    onPickCustomer("");
                  } else {
                    setIsGuest(true);
                    setCustomerId("");
                    setCustomerName("ضيف");
                    setCustomerPhone("");
                    setGuestBrand("");
                    setGuestModel("");
                    setGuestPlate("");
                    setGuestColor("");
                    setSelectedVehicleIds(["guest-slot"]);
                  }
                }}
              >
                {isGuest ? "إلغاء وضع الضيف" : "دخول كضيف"}
              </Button>
            </div>
            {selectedCustomer ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="اسم العميل">
                  <Input value={customerName} readOnly className="bg-slate-50 text-slate-600" />
                </Field>
                <Field label="رقم الهاتف">
                  <Input value={customerPhone} readOnly inputMode="tel" className="bg-slate-50 text-slate-600" />
                </Field>
              </div>
            ) : null}
          </div>

          <div className="md:col-span-2 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">مركبات الاستقبال</div>
                <div className="text-xs text-slate-500">
                  {isGuest
                    ? "أدخل بيانات مركبة الضيف مباشرة."
                    : "اختر مركبة محفوظة من ملف العميل لكل تذكرة غسيل."}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isGuest || (!customerId && !customerName.trim())}
                  onClick={openVehicleDialog}
                >
                  <Plus className="w-4 h-4" /> مركبة جديدة
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isGuest || (!customerId && !customerName.trim()) || selectedVehicleIds.some((id) => !id)}
                  onClick={addVehicleSlot}
                >
                  <Plus className="w-4 h-4" /> سيارة أخرى للغسيل
                </Button>
              </div>
            </div>

            {isGuest ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-50 text-amber-700">1</span>
                  بيانات مركبة الضيف
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="الماركة">
                    <BrandCombobox
                      value={guestBrand}
                      onChange={(brand) => setGuestBrand(brand)}
                    />
                  </Field>
                  <Field label="الموديل">
                    <Input
                      value={guestModel}
                      onChange={(e) => setGuestModel(e.target.value)}
                      placeholder="مثال: إلنترا"
                    />
                  </Field>
                  <Field label="رقم اللوحة">
                    <Input
                      value={guestPlate}
                      onChange={(e) => setGuestPlate(e.target.value)}
                      placeholder="أ ب ج 1 2 3"
                      className="font-mono"
                    />
                  </Field>
                  <Field label="اللون">
                    <Input
                      value={guestColor}
                      onChange={(e) => setGuestColor(e.target.value)}
                      placeholder="مثال: كحلي"
                    />
                  </Field>
                </div>
              </div>
            ) : (
              selectedVehicleIds.map((selectedId, index) => {
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
              })
            )}
          </div>
          <Field label="الخدمات" className="md:col-span-2">
            {activeServices.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                لا توجد خدمات مفعّلة. أضف الخدمات من صفحة الخدمات أولاً.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {activeServices.map((service) => {
                  const selected = serviceIds.includes(service.id);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service.id)}
                      className={[
                        "rounded-xl border-2 px-3 py-4 text-sm font-medium transition-all duration-150 text-center leading-snug",
                        selected
                          ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {service.name}
                    </button>
                  );
                })}
              </div>
            )}
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

          <Field label="ملاحظة" className="md:col-span-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: العميل مستعجل / خدش في الباب الخلفي" />
          </Field>
        </div>
      </Dialog>

      <CustomerFormDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        initialName={customerDialogPrefill}
        onCreated={(customer) => {
          onPickCustomer(customer.id);
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

  const primaryAction =
    canEdit && onStartWash ? (
      <Button size="md" className="flex-1" onClick={onStartWash}>
        <Play className="h-4 w-4" /> ابدأ الغسيل
      </Button>
    ) : canEdit && onComplete ? (
      <Button size="md" variant="success" className="flex-1" onClick={onComplete}>
        <Check className="h-4 w-4" /> جاهز للتسليم
      </Button>
    ) : onOpenInvoice ? (
      <Button size="md" variant="outline" className="flex-1" onClick={onOpenInvoice}>
        <Receipt className="h-4 w-4" /> فتح الفاتورة
      </Button>
    ) : canInvoice && onInvoice ? (
      <Button size="md" variant="outline" className="flex-1" onClick={onInvoice}>
        <Receipt className="h-4 w-4" /> إنشاء الفاتورة
      </Button>
    ) : null;

  // فاتورة يبقى إجراء ثانوي لو فيه إجراء أساسي أهم منه في نفس الكارت.
  const secondaryInvoice =
    primaryAction && canInvoice && onInvoice && !onOpenInvoice && (onStartWash || onComplete) ? (
      <Button size="sm" variant="outline" onClick={onInvoice} title="إنشاء فاتورة">
        <Receipt className="h-3.5 w-3.5" /> فاتورة
      </Button>
    ) : null;

  const hasReorder = canEdit && (onMoveUp || onMoveDown);
  const hasUtility = Boolean(secondaryInvoice || onPrint || (canEdit && onRequeue && t.status !== "delivered") || (canCancel && onCancel));

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "queue-ticket-card rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-sm",
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        isDragging ? "is-dragging" : ""
      )}
    >
      {/* ── Header: number + customer + status ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {draggable ? (
            <span className="grid h-9 w-4 shrink-0 place-items-center text-slate-300" aria-hidden="true">
              <GripVertical className="h-4 w-4" />
            </span>
          ) : null}
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-lg font-bold text-brand-700">
            {t.number}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-slate-900">{t.customerName}</div>
            {carsAhead > 0 ? (
              <div className="text-[11px] text-slate-400">سيارات قبله: {carsAhead}</div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          {t.missedTurn ? <Badge tone="orange">معاد ترتيبه</Badge> : null}
        </div>
      </div>

      {/* ── Vehicle + timing + services ── */}
      <div className="space-y-1.5 text-xs text-slate-500">
        {t.vehicleLabel || t.vehicleBrand ? (
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
            <Car className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 truncate">{t.vehicleLabel ?? t.vehicleBrand}</span>
          </div>
        ) : null}
        {t.phone ? (
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500" dir="ltr">
            <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{t.phone}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            الوصول: {formatDateTime(t.arrivalTime)}
          </span>
          {t.requestedPickupAt ? (
            <span className={cn("font-medium", pickupLate ? "text-amber-700" : "text-slate-600")}>
              الاستلام: {formatDateTime(t.requestedPickupAt)}
            </span>
          ) : null}
        </div>
        {services.length ? (
          <div className="rounded-md bg-slate-50 px-2 py-1 text-[12px] text-slate-600">
            {services.join("، ")}
          </div>
        ) : null}
        {t.note ? <div className="text-amber-700">📝 {t.note}</div> : null}
        {t.damageAreas && t.damageAreas.length ? (
          <div className="text-rose-600">⚠ أضرار مسبقة: {t.damageAreas.join("، ")}</div>
        ) : null}
      </div>

      {/* ── Key status ── */}
      {keyIsReceived || (canEdit && onReceiveKey) || t.keyDeliveredAt || (keyIsReceived && canEdit && onDeliverKey && t.status === "done") ? (
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
      ) : null}

      {/* ── Actions: prominent primary + muted utility strip ── */}
      {primaryAction || hasReorder || hasUtility ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {primaryAction ? (
            <div className="flex items-center gap-2">
              {hasReorder ? (
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={!canMoveUp}
                    title="تحريك لأعلى"
                    className="grid h-5 w-8 place-items-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={!canMoveDown}
                    title="تحريك لأسفل"
                    className="grid h-5 w-8 place-items-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
              {primaryAction}
            </div>
          ) : null}

          {hasUtility ? (
            <div className="flex flex-wrap items-center gap-1">
              {secondaryInvoice}
              {onPrint ? (
                <Button size="icon" variant="ghost" onClick={onPrint} title="طباعة تذكرة الاستقبال">
                  <Printer className="h-4 w-4" />
                </Button>
              ) : null}
              {canEdit && onRequeue && t.status !== "delivered" ? (
                <Button size="icon" variant="ghost" onClick={onRequeue} title="إرجاع لآخر الطابور">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              ) : null}
              <span className="flex-1" />
              {canCancel && onCancel ? (
                <Button size="icon" variant="ghost" onClick={onCancel} title="إلغاء">
                  <X className="h-4 w-4 text-rose-500" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
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
