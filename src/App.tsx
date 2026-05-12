import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./store/AppContext";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductsPage } from "./pages/ProductsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { CustomersPage } from "./pages/CustomersPage";
import { PurchaseInvoicesPage } from "./pages/PurchaseInvoicesPage";
import { PurchaseInvoiceNewPage } from "./pages/PurchaseInvoiceNewPage";
import { PurchaseInvoiceDetailPage } from "./pages/PurchaseInvoiceDetailPage";
import { PurchaseInvoicePrintPage } from "./pages/PurchaseInvoicePrintPage";
import { SalesInvoicesPage } from "./pages/SalesInvoicesPage";
import { SalesInvoiceNewPage } from "./pages/SalesInvoiceNewPage";
import { SalesInvoiceDetailPage } from "./pages/SalesInvoiceDetailPage";
import { SalesInvoicePrintPage } from "./pages/SalesInvoicePrintPage";
import { AlertsPage } from "./pages/AlertsPage";
import { CashboxPage } from "./pages/CashboxPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { auth } = useApp();
  const loc = useLocation();
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  const { auth } = useApp();

  return (
    <Routes>
      <Route
        path="/login"
        element={auth.isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      {/* Print routes (no layout) */}
      <Route path="/sales/:id/print" element={<SalesInvoicePrintPage />} />
      <Route path="/purchases/:id/print" element={<PurchaseInvoicePrintPage />} />

      <Route
        path="/"
        element={
          <ProtectedShell>
            <DashboardPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedShell>
            <ProductsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedShell>
            <InventoryPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedShell>
            <SuppliersPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedShell>
            <CustomersPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/purchases"
        element={
          <ProtectedShell>
            <PurchaseInvoicesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/purchases/new"
        element={
          <ProtectedShell>
            <PurchaseInvoiceNewPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/purchases/:id"
        element={
          <ProtectedShell>
            <PurchaseInvoiceDetailPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/sales"
        element={
          <ProtectedShell>
            <SalesInvoicesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/sales/new"
        element={
          <ProtectedShell>
            <SalesInvoiceNewPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/sales/:id"
        element={
          <ProtectedShell>
            <SalesInvoiceDetailPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/alerts"
        element={
          <ProtectedShell>
            <AlertsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/cashbox"
        element={
          <ProtectedShell>
            <CashboxPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedShell>
            <ReportsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedShell>
            <SettingsPage />
          </ProtectedShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
