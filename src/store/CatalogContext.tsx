import { createContext, useContext } from "react";
import type { CommissionTier, Customer, Driver, Product, Supplier } from "../types";

export interface CatalogContextValue {
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  drivers: Driver[];
  nextProductCode: number;
  nextSupplierCode: number;
  nextCustomerCode: number;
  addProduct: (p: Omit<Product, "id" | "createdAt">) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => boolean;
  adjustStock: (productId: string, delta: number, reason: string, looseDelta?: number) => void;
  addSupplier: (s: Omit<Supplier, "id" | "createdAt">) => Supplier;
  updateSupplier: (id: string, patch: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => boolean;
  addCommissionTier: (supplierId: string, tier: Omit<CommissionTier, "id">) => void;
  updateCommissionTier: (supplierId: string, tierId: string, patch: Partial<CommissionTier>) => void;
  deleteCommissionTier: (supplierId: string, tierId: string) => void;
  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  deleteCustomer: (id: string) => boolean;
  addDriver: (d: Omit<Driver, "id" | "createdAt">) => Driver;
  updateDriver: (id: string, patch: Partial<Driver>) => void;
  deleteDriver: (id: string) => boolean;
}

export const CatalogContext = createContext<CatalogContextValue | null>(null);

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within AppProvider");
  return ctx;
}
