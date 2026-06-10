import { createContext, useContext } from "react";
import type { CommissionType, ID } from "../types";

export interface ReportingContextValue {
  customerBalance: (customerId: string) => number;
  customerCredit: (customerId: string) => number;
  supplierBalance: (supplierId: string) => number;
  supplierCredit: (supplierId: string) => number;
  calculateSupplierCommission: (supplierId: string) => {
    tierId: string;
    threshold: number;
    periodDays: number;
    totalPurchases: number;
    earned: number;
    commissionType: CommissionType;
    commissionValue: number;
  }[];
  employeeSalesStats: (
    userId: ID,
    quarter: string
  ) => {
    totalCollected: number;
    commissionEarned: number;
    salary: number;
    totalEarnings: number;
    quarterLabel: string;
  };
  exportToExcel: (
    dataType:
      | "products"
      | "customers"
      | "suppliers"
      | "sales"
      | "purchases"
      | "stock"
      | "supplierDues"
      | "commissions"
  ) => void;
}

export const ReportingContext = createContext<ReportingContextValue | null>(null);

export function useReporting(): ReportingContextValue {
  const ctx = useContext(ReportingContext);
  if (!ctx) throw new Error("useReporting must be used within AppProvider");
  return ctx;
}
