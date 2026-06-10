import { createContext, useContext } from "react";
import type {
  CashEntry,
  ID,
  InvoiceLine,
  PurchaseInvoice,
  PurchaseReturn,
  SalesInvoice,
  SalesReturn,
  StockMovement,
} from "../types";

export interface InvoicingContextValue {
  salesInvoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  cashEntries: CashEntry[];
  stockMovements: StockMovement[];
  addSalesInvoice: (
    inv: Omit<SalesInvoice, "id" | "createdAt" | "status" | "remaining">
  ) => SalesInvoice;
  updateSalesInvoice: (
    id: string,
    patch: Omit<SalesInvoice, "id" | "createdAt" | "customerId" | "customerName" | "status" | "remaining">
  ) => void;
  recordSalesReceipt: (id: string, amount: number) => void;
  cancelSalesInvoice: (id: string, refundMode?: "cash" | "credit") => void;
  deleteSalesInvoice: (id: string) => boolean;
  settleAllDues: (customerId: ID) => number;
  addPurchaseInvoice: (
    inv: Omit<PurchaseInvoice, "id" | "createdAt" | "status" | "remaining">
  ) => PurchaseInvoice;
  updatePurchaseInvoice: (
    id: string,
    patch: { lines: InvoiceLine[]; date: string; notes?: string }
  ) => void;
  recordPurchasePayment: (id: string, amount: number) => void;
  deletePurchaseInvoice: (id: string) => boolean;
  addSalesReturn: (
    r: Omit<SalesReturn, "id" | "createdAt" | "returnNumber">
  ) => SalesReturn;
  addPurchaseReturn: (
    r: Omit<PurchaseReturn, "id" | "createdAt" | "returnNumber">
  ) => PurchaseReturn;
  addCashEntry: (entry: Omit<CashEntry, "id"> & { id?: string }) => CashEntry;
  currentCashBalance: () => number;
}

export const InvoicingContext = createContext<InvoicingContextValue | null>(null);

export function useInvoicing(): InvoicingContextValue {
  const ctx = useContext(InvoicingContext);
  if (!ctx) throw new Error("useInvoicing must be used within AppProvider");
  return ctx;
}
