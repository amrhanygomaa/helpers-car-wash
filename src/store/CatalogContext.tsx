import { createContext, useContext } from "react";
import type { Customer, Product } from "../types";

export interface CatalogContextValue {
  products: Product[];
  customers: Customer[];
  nextCustomerCode: number;
  nextProductCode: number;
  addProduct: (p: Omit<Product, "id" | "createdAt">) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => boolean;
  adjustStock: (productId: string, delta: number, reason: string, looseDelta?: number) => void;
  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  deleteCustomer: (id: string) => boolean;
  archiveCustomer: (id: string, archived: boolean) => void;
}

export const CatalogContext = createContext<CatalogContextValue | null>(null);

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within AppProvider");
  return ctx;
}
