import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CashEntry,
  Customer,
  Product,
  PurchaseInvoice,
  SalesInvoice,
  Settings,
  StockMovement,
  Supplier,
} from "../types";
import { lsClearAll, lsGet, lsSet } from "../lib/storage";
import {
  seedCashEntries,
  seedCustomers,
  seedProducts,
  seedPurchaseInvoices,
  seedSalesInvoices,
  seedSettings,
  seedStockMovements,
  seedSuppliers,
} from "../data/seed";
import { uid } from "../lib/utils";

interface AuthState {
  isAuthenticated: boolean;
  username?: string;
}

interface AppState {
  auth: AuthState;
  settings: Settings;
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  stockMovements: StockMovement[];
  cashEntries: CashEntry[];
}

interface AppActions {
  login: (username: string) => void;
  logout: () => void;
  resetDemo: () => void;
  updateSettings: (patch: Partial<Settings>) => void;

  // Products
  addProduct: (p: Omit<Product, "id" | "createdAt">) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => boolean;
  adjustStock: (
    productId: string,
    delta: number,
    reason: string
  ) => void;

  // Suppliers
  addSupplier: (s: Omit<Supplier, "id" | "createdAt">) => Supplier;
  updateSupplier: (id: string, patch: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => boolean;

  // Customers
  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  deleteCustomer: (id: string) => boolean;

  // Purchase invoices
  addPurchaseInvoice: (
    inv: Omit<PurchaseInvoice, "id" | "createdAt" | "status" | "remaining">
  ) => PurchaseInvoice;
  recordPurchasePayment: (id: string, amount: number) => void;
  deletePurchaseInvoice: (id: string) => boolean;

  // Sales invoices
  addSalesInvoice: (
    inv: Omit<SalesInvoice, "id" | "createdAt" | "status" | "remaining">
  ) => SalesInvoice;
  recordSalesReceipt: (id: string, amount: number) => void;
  cancelSalesInvoice: (id: string) => void;
  deleteSalesInvoice: (id: string) => boolean;

  // Cashbox
  addCashEntry: (
    entry: Omit<CashEntry, "id"> & { id?: string }
  ) => CashEntry;

  // Derived
  currentCashBalance: () => number;
  customerBalance: (customerId: string) => number;
  supplierBalance: (supplierId: string) => number;
}

type AppContextValue = AppState & AppActions;

const AppContext = createContext<AppContextValue | null>(null);

function computeStatus(
  total: number,
  paid: number
): "paid" | "partial" | "unpaid" {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() =>
    lsGet<AuthState>("auth", { isAuthenticated: false })
  );
  const [settings, setSettings] = useState<Settings>(() =>
    lsGet<Settings>("settings", seedSettings)
  );
  const [products, setProducts] = useState<Product[]>(() =>
    lsGet<Product[]>("products", seedProducts)
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() =>
    lsGet<Supplier[]>("suppliers", seedSuppliers)
  );
  const [customers, setCustomers] = useState<Customer[]>(() =>
    lsGet<Customer[]>("customers", seedCustomers)
  );
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>(
    () => lsGet<PurchaseInvoice[]>("purchaseInvoices", seedPurchaseInvoices)
  );
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>(() =>
    lsGet<SalesInvoice[]>("salesInvoices", seedSalesInvoices)
  );
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() =>
    lsGet<StockMovement[]>("stockMovements", seedStockMovements)
  );
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() =>
    lsGet<CashEntry[]>("cashEntries", seedCashEntries)
  );

  useEffect(() => lsSet("auth", auth), [auth]);
  useEffect(() => lsSet("settings", settings), [settings]);
  useEffect(() => lsSet("products", products), [products]);
  useEffect(() => lsSet("suppliers", suppliers), [suppliers]);
  useEffect(() => lsSet("customers", customers), [customers]);
  useEffect(
    () => lsSet("purchaseInvoices", purchaseInvoices),
    [purchaseInvoices]
  );
  useEffect(() => lsSet("salesInvoices", salesInvoices), [salesInvoices]);
  useEffect(() => lsSet("stockMovements", stockMovements), [stockMovements]);
  useEffect(() => lsSet("cashEntries", cashEntries), [cashEntries]);

  const login = useCallback((username: string) => {
    setAuth({ isAuthenticated: true, username });
  }, []);
  const logout = useCallback(() => {
    setAuth({ isAuthenticated: false });
  }, []);

  const resetDemo = useCallback(() => {
    lsClearAll();
    setAuth({ isAuthenticated: true, username: "admin" });
    setSettings(seedSettings);
    setProducts(seedProducts);
    setSuppliers(seedSuppliers);
    setCustomers(seedCustomers);
    setPurchaseInvoices(seedPurchaseInvoices);
    setSalesInvoices(seedSalesInvoices);
    setStockMovements(seedStockMovements);
    setCashEntries(seedCashEntries);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  // Products
  const addProduct: AppActions["addProduct"] = (p) => {
    const product: Product = {
      ...p,
      id: uid("prd"),
      createdAt: new Date().toISOString(),
    };
    setProducts((list) => [product, ...list]);
    return product;
  };
  const updateProduct: AppActions["updateProduct"] = (id, patch) => {
    setProducts((list) =>
      list.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  };
  const deleteProduct: AppActions["deleteProduct"] = (id) => {
    // prevent deletion if used in invoices
    const used =
      purchaseInvoices.some((inv) =>
        inv.lines.some((l) => l.productId === id)
      ) ||
      salesInvoices.some((inv) =>
        inv.lines.some((l) => l.productId === id)
      );
    if (used) return false;
    setProducts((list) => list.filter((p) => p.id !== id));
    return true;
  };
  const adjustStock: AppActions["adjustStock"] = (productId, delta, reason) => {
    setProducts((list) =>
      list.map((p) =>
        p.id === productId
          ? { ...p, quantity: Math.max(0, p.quantity + delta) }
          : p
      )
    );
    const prod = products.find((x) => x.id === productId);
    if (prod) {
      const mv: StockMovement = {
        id: uid("mov"),
        productId,
        productName: prod.name,
        type: delta >= 0 ? "adjustment-in" : "adjustment-out",
        quantity: delta,
        reason,
        referenceType: "manual",
        date: new Date().toISOString(),
      };
      setStockMovements((l) => [mv, ...l]);
    }
  };

  // Suppliers
  const addSupplier: AppActions["addSupplier"] = (s) => {
    const sup: Supplier = {
      ...s,
      id: uid("sup"),
      createdAt: new Date().toISOString(),
    };
    setSuppliers((list) => [sup, ...list]);
    return sup;
  };
  const updateSupplier: AppActions["updateSupplier"] = (id, patch) => {
    setSuppliers((list) =>
      list.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };
  const deleteSupplier: AppActions["deleteSupplier"] = (id) => {
    const hasInvoices = purchaseInvoices.some((inv) => inv.supplierId === id);
    const hasProducts = products.some((p) => p.supplierId === id);
    if (hasInvoices || hasProducts) return false;
    setSuppliers((list) => list.filter((s) => s.id !== id));
    return true;
  };

  // Customers
  const addCustomer: AppActions["addCustomer"] = (c) => {
    const cus: Customer = {
      ...c,
      id: uid("cus"),
      createdAt: new Date().toISOString(),
    };
    setCustomers((list) => [cus, ...list]);
    return cus;
  };
  const updateCustomer: AppActions["updateCustomer"] = (id, patch) => {
    setCustomers((list) =>
      list.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };
  const deleteCustomer: AppActions["deleteCustomer"] = (id) => {
    const hasInvoices = salesInvoices.some((inv) => inv.customerId === id);
    if (hasInvoices) return false;
    setCustomers((list) => list.filter((c) => c.id !== id));
    return true;
  };

  // Purchase invoices
  const addPurchaseInvoice: AppActions["addPurchaseInvoice"] = (inv) => {
    const id = uid("pur");
    const status = computeStatus(inv.total, inv.amountPaid);
    const remaining = Math.max(0, inv.total - inv.amountPaid);
    const full: PurchaseInvoice = {
      ...inv,
      id,
      status,
      remaining,
      createdAt: new Date().toISOString(),
    };
    setPurchaseInvoices((list) => [full, ...list]);

    // stock increments
    setProducts((list) =>
      list.map((p) => {
        const line = inv.lines.find((l) => l.productId === p.id);
        if (!line) return p;
        const patch: Partial<Product> = {
          quantity: p.quantity + line.quantity,
        };
        if (line.expiryDate && p.hasExpiry) {
          patch.expiryDate = line.expiryDate;
        }
        return { ...p, ...patch };
      })
    );

    // stock movements
    const movements: StockMovement[] = inv.lines.map((l, idx) => ({
      id: uid(`mov_p_${idx}`),
      productId: l.productId,
      productName: l.productName,
      type: "purchase",
      quantity: l.quantity,
      referenceId: id,
      referenceType: "purchase",
      date: inv.date,
    }));
    setStockMovements((list) => [...movements, ...list]);

    // cash entry if paid
    if (inv.amountPaid > 0) {
      const ce: CashEntry = {
        id: uid("cash_p"),
        type: "purchase-payment",
        amount: -inv.amountPaid,
        description: `سداد فاتورة مشتريات ${inv.invoiceNumber} — ${inv.supplierName}`,
        referenceId: id,
        date: inv.date,
      };
      setCashEntries((list) => [ce, ...list]);
    }

    return full;
  };
  const recordPurchasePayment: AppActions["recordPurchasePayment"] = (
    id,
    amount
  ) => {
    if (amount <= 0) return;
    setPurchaseInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== id) return inv;
        const paid = Math.min(inv.total, inv.amountPaid + amount);
        return {
          ...inv,
          amountPaid: paid,
          remaining: Math.max(0, inv.total - paid),
          status: computeStatus(inv.total, paid),
        };
      })
    );
    const inv = purchaseInvoices.find((i) => i.id === id);
    if (inv) {
      const ce: CashEntry = {
        id: uid("cash_p"),
        type: "purchase-payment",
        amount: -amount,
        description: `دفعة على فاتورة مشتريات ${inv.invoiceNumber} — ${inv.supplierName}`,
        referenceId: id,
        date: new Date().toISOString().slice(0, 10),
      };
      setCashEntries((list) => [ce, ...list]);
    }
  };
  const deletePurchaseInvoice: AppActions["deletePurchaseInvoice"] = (id) => {
    const inv = purchaseInvoices.find((i) => i.id === id);
    if (!inv) return false;
    // revert stock
    setProducts((list) =>
      list.map((p) => {
        const l = inv.lines.find((x) => x.productId === p.id);
        if (!l) return p;
        return { ...p, quantity: Math.max(0, p.quantity - l.quantity) };
      })
    );
    setPurchaseInvoices((list) => list.filter((i) => i.id !== id));
    setStockMovements((list) => list.filter((m) => m.referenceId !== id));
    setCashEntries((list) => list.filter((c) => c.referenceId !== id));
    return true;
  };

  // Sales invoices
  const addSalesInvoice: AppActions["addSalesInvoice"] = (inv) => {
    const id = uid("sal");
    const status = computeStatus(inv.total, inv.amountReceived);
    const remaining = Math.max(0, inv.total - inv.amountReceived);
    const full: SalesInvoice = {
      ...inv,
      id,
      status,
      remaining,
      createdAt: new Date().toISOString(),
    };
    setSalesInvoices((list) => [full, ...list]);

    // stock decrements
    setProducts((list) =>
      list.map((p) => {
        const l = inv.lines.find((x) => x.productId === p.id);
        if (!l) return p;
        return { ...p, quantity: Math.max(0, p.quantity - l.quantity) };
      })
    );
    const movements: StockMovement[] = inv.lines.map((l, idx) => ({
      id: uid(`mov_s_${idx}`),
      productId: l.productId,
      productName: l.productName,
      type: "sale",
      quantity: -l.quantity,
      referenceId: id,
      referenceType: "sale",
      date: inv.date,
    }));
    setStockMovements((list) => [...movements, ...list]);

    if (inv.amountReceived > 0) {
      const ce: CashEntry = {
        id: uid("cash_s"),
        type: "sales-receipt",
        amount: inv.amountReceived,
        description: `تحصيل فاتورة مبيعات ${inv.invoiceNumber} — ${inv.customerName}`,
        referenceId: id,
        date: inv.date,
      };
      setCashEntries((list) => [ce, ...list]);
    }
    return full;
  };
  const recordSalesReceipt: AppActions["recordSalesReceipt"] = (id, amount) => {
    if (amount <= 0) return;
    setSalesInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== id) return inv;
        const received = Math.min(inv.total, inv.amountReceived + amount);
        return {
          ...inv,
          amountReceived: received,
          remaining: Math.max(0, inv.total - received),
          status: computeStatus(inv.total, received),
        };
      })
    );
    const inv = salesInvoices.find((i) => i.id === id);
    if (inv) {
      const ce: CashEntry = {
        id: uid("cash_s"),
        type: "sales-receipt",
        amount,
        description: `دفعة على فاتورة مبيعات ${inv.invoiceNumber} — ${inv.customerName}`,
        referenceId: id,
        date: new Date().toISOString().slice(0, 10),
      };
      setCashEntries((list) => [ce, ...list]);
    }
  };
  const cancelSalesInvoice: AppActions["cancelSalesInvoice"] = (id) => {
    const inv = salesInvoices.find((i) => i.id === id);
    if (!inv || inv.cancelled) return;
    // return stock
    setProducts((list) =>
      list.map((p) => {
        const l = inv.lines.find((x) => x.productId === p.id);
        if (!l) return p;
        return { ...p, quantity: p.quantity + l.quantity };
      })
    );
    setSalesInvoices((list) =>
      list.map((i) => (i.id === id ? { ...i, cancelled: true } : i))
    );
    const mv: StockMovement = {
      id: uid("mov_ret"),
      productId: inv.lines[0]?.productId ?? "",
      productName: "إلغاء فاتورة " + inv.invoiceNumber,
      type: "return",
      quantity: inv.lines.reduce((a, b) => a + b.quantity, 0),
      reason: `إلغاء فاتورة مبيعات ${inv.invoiceNumber}`,
      referenceId: id,
      referenceType: "sale",
      date: new Date().toISOString().slice(0, 10),
    };
    setStockMovements((list) => [mv, ...list]);
  };
  const deleteSalesInvoice: AppActions["deleteSalesInvoice"] = (id) => {
    const inv = salesInvoices.find((i) => i.id === id);
    if (!inv) return false;
    if (!inv.cancelled) {
      setProducts((list) =>
        list.map((p) => {
          const l = inv.lines.find((x) => x.productId === p.id);
          if (!l) return p;
          return { ...p, quantity: p.quantity + l.quantity };
        })
      );
    }
    setSalesInvoices((list) => list.filter((i) => i.id !== id));
    setStockMovements((list) => list.filter((m) => m.referenceId !== id));
    setCashEntries((list) => list.filter((c) => c.referenceId !== id));
    return true;
  };

  // Cashbox
  const addCashEntry: AppActions["addCashEntry"] = (entry) => {
    const full: CashEntry = {
      id: entry.id ?? uid("cash"),
      type: entry.type,
      amount: entry.amount,
      description: entry.description,
      referenceId: entry.referenceId,
      date: entry.date,
    };
    setCashEntries((list) => [full, ...list]);
    return full;
  };

  // Derived
  const currentCashBalance = useCallback(() => {
    return (
      settings.openingBalance +
      cashEntries.reduce((a, e) => a + e.amount, 0)
    );
  }, [settings.openingBalance, cashEntries]);

  const customerBalance = useCallback(
    (customerId: string) => {
      return salesInvoices
        .filter((s) => s.customerId === customerId && !s.cancelled)
        .reduce((a, s) => a + s.remaining, 0);
    },
    [salesInvoices]
  );

  const supplierBalance = useCallback(
    (supplierId: string) => {
      return purchaseInvoices
        .filter((p) => p.supplierId === supplierId)
        .reduce((a, p) => a + p.remaining, 0);
    },
    [purchaseInvoices]
  );

  const value: AppContextValue = useMemo(
    () => ({
      auth,
      settings,
      products,
      suppliers,
      customers,
      purchaseInvoices,
      salesInvoices,
      stockMovements,
      cashEntries,
      login,
      logout,
      resetDemo,
      updateSettings,
      addProduct,
      updateProduct,
      deleteProduct,
      adjustStock,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addPurchaseInvoice,
      recordPurchasePayment,
      deletePurchaseInvoice,
      addSalesInvoice,
      recordSalesReceipt,
      cancelSalesInvoice,
      deleteSalesInvoice,
      addCashEntry,
      currentCashBalance,
      customerBalance,
      supplierBalance,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      auth,
      settings,
      products,
      suppliers,
      customers,
      purchaseInvoices,
      salesInvoices,
      stockMovements,
      cashEntries,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
