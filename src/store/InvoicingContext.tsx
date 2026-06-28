import { createContext, useContext } from "react";
import type {
  CashEntry,
  DiscountCode,
  ID,
  PaymentMethod,
  SalesInvoice,
} from "../types";

export interface InvoicingContextValue {
  salesInvoices: SalesInvoice[];
  cashEntries: CashEntry[];
  discountCodes: DiscountCode[];
  addSalesInvoice: (
    inv: Omit<SalesInvoice, "id" | "createdAt" | "status" | "remaining">
  ) => SalesInvoice;
  recordSalesReceipt: (id: string, amount: number, paymentMethod?: PaymentMethod, notes?: string) => void;
  cancelSalesInvoice: (id: string, refundMode?: "cash" | "credit") => void;
  deleteSalesInvoice: (id: string) => boolean;
  applyCustomerCredit: (customerId: string, invoiceId: string, amount: number) => void;
  settleAllDues: (customerId: ID) => number;
  addCashEntry: (entry: Omit<CashEntry, "id"> & { id?: string }) => CashEntry;
  currentCashBalance: () => number;
}

export const InvoicingContext = createContext<InvoicingContextValue | null>(null);

export function useInvoicing(): InvoicingContextValue {
  const ctx = useContext(InvoicingContext);
  if (!ctx) throw new Error("useInvoicing must be used within AppProvider");
  return ctx;
}
