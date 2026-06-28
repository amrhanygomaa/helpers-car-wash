import { createContext, useContext } from "react";
import type { QueueStatus, QueueTicket, Vehicle, WashService } from "../types";

/**
 * Car Wash slice — vehicles, wash services (catalog + material BOM) and the
 * incoming-car queue (with embedded key tracking). Kept separate from the
 * warehouse contexts so the existing slices stay untouched. Actions are plain
 * functions (same pattern as CatalogContext): the value is memoized on the data
 * arrays only.
 */
export interface CarwashContextValue {
  // Vehicles (feature 2)
  vehicles: Vehicle[];
  addVehicle: (v: Omit<Vehicle, "id" | "createdAt">) => Vehicle;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => boolean;
  archiveVehicle: (id: string, archived: boolean) => void;

  // Wash services (features 3 + 7)
  washServices: WashService[];
  addWashService: (s: Omit<WashService, "id" | "createdAt">) => WashService;
  updateWashService: (id: string, patch: Partial<WashService>) => void;
  deleteWashService: (id: string) => boolean;

  // Queue + key tracking (features 1 + 6)
  queueTickets: QueueTicket[];
  nextQueueNumber: number;
  addQueueTicket: (
    t: Omit<QueueTicket, "id" | "number" | "createdAt" | "status"> & { status?: QueueStatus }
  ) => QueueTicket;
  updateQueueTicket: (id: string, patch: Partial<QueueTicket>) => void;
  setQueueStatus: (id: string, status: QueueStatus) => void;
  reorderQueueTicket: (id: string, direction: "up" | "down") => void;
  requeueTicket: (id: string) => void;
  receiveVehicleKey: (id: string) => void;
  deliverVehicleKey: (id: string) => void;
}

export const CarwashContext = createContext<CarwashContextValue | null>(null);

export function useCarwash(): CarwashContextValue {
  const ctx = useContext(CarwashContext);
  if (!ctx) throw new Error("useCarwash must be used within AppProvider");
  return ctx;
}
