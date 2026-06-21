import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./store/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { ActivationPage } from "./pages/ActivationPage";
import { FirstRunSetupPage } from "./pages/FirstRunSetupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductsPage } from "./pages/ProductsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { CustomersPage } from "./pages/CustomersPage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { ServicesPage } from "./pages/ServicesPage";
import { CarwashInvoiceNewPage } from "./pages/CarwashInvoiceNewPage";
import { QueuePage } from "./pages/QueuePage";
import { CarwashReportsPage } from "./pages/CarwashReportsPage";
import { PurchaseInvoicesPage } from "./pages/PurchaseInvoicesPage";
import { PurchaseInvoiceNewPage } from "./pages/PurchaseInvoiceNewPage";
import { PurchaseInvoiceDetailPage } from "./pages/PurchaseInvoiceDetailPage";
import { PurchaseInvoiceEditPage } from "./pages/PurchaseInvoiceEditPage";
import { PurchaseInvoicePrintPage } from "./pages/PurchaseInvoicePrintPage";
import { SalesInvoicesPage } from "./pages/SalesInvoicesPage";
import { SalesInvoiceNewPage } from "./pages/SalesInvoiceNewPage";
import { SalesInvoiceEditPage } from "./pages/SalesInvoiceEditPage";
import { SalesInvoiceDetailPage } from "./pages/SalesInvoiceDetailPage";
import { SalesInvoicePrintPage } from "./pages/SalesInvoicePrintPage";
import { AlertsPage } from "./pages/AlertsPage";
import { QuotationsPage } from "./pages/QuotationsPage";
import { StocktakesPage } from "./pages/StocktakesPage";
import { ImportPage } from "./pages/ImportPage";
import { StocktakeDetailPage } from "./pages/StocktakeDetailPage";
import { QuotationNewPage } from "./pages/QuotationNewPage";
import { QuotationEditPage } from "./pages/QuotationEditPage";
import { QuotationDetailPage } from "./pages/QuotationDetailPage";
import { QuotationPrintPage } from "./pages/QuotationPrintPage";
import { CashboxPage } from "./pages/CashboxPage";
import { DuesPage } from "./pages/DuesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { EmployeeReportPage } from "./pages/EmployeeReportPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { ReturnsPage } from "./pages/ReturnsPage";
import { DriversPage } from "./pages/DriversPage";
import { EmployeeProfilePage } from "./pages/EmployeeProfilePage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { CustomerStatementPrintPage } from "./pages/CustomerStatementPrintPage";
import { SupplierStatementPrintPage } from "./pages/SupplierStatementPrintPage";
import { ProtectedShell } from "./components/layout/ProtectedShell";

export default function App() {
  const { auth, isDesktop, licenseStatus, ownerExists, ownerCheckPending } = useAuth();

  if (isDesktop) {
    if (!licenseStatus || licenseStatus.state !== "active") {
      return <ActivationPage />;
    }
    if (ownerCheckPending) {
      return (
        <div className="min-h-screen grid place-items-center bg-slate-50" dir="rtl">
          <div className="text-sm text-slate-500">جاري فحص حساب المدير...</div>
        </div>
      );
    }
    if (!ownerExists) {
      return <FirstRunSetupPage />;
    }
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={auth.isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      {/* Print routes (no layout) */}
      <Route path="/sales/:id/print" element={<SalesInvoicePrintPage />} />
      <Route path="/purchases/:id/print" element={<PurchaseInvoicePrintPage />} />
      <Route path="/customers/:id/statement" element={<CustomerStatementPrintPage />} />
      <Route path="/suppliers/:id/statement" element={<SupplierStatementPrintPage />} />
      <Route path="/quotations/:id/print" element={<QuotationPrintPage />} />

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
          <ProtectedShell permission="products" feature="products">
            <ProductsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedShell permission="inventory" feature="inventory">
            <InventoryPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedShell permission="suppliers" feature="suppliers">
            <SuppliersPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedShell permission="customers" feature="customers">
            <CustomersPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/vehicles"
        element={
          <ProtectedShell permission="vehicles" feature="vehicles">
            <VehiclesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/services"
        element={
          <ProtectedShell permission="washServices" feature="washServices">
            <ServicesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/carwash/new"
        element={
          <ProtectedShell permission="salesInvoices" permissionAction="add" feature="washServices">
            <CarwashInvoiceNewPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/queue"
        element={
          <ProtectedShell permission="queue" feature="carwashQueue">
            <QueuePage />
          </ProtectedShell>
        }
      />
      <Route
        path="/carwash/reports"
        element={
          <ProtectedShell permission="reports" feature="washServices">
            <CarwashReportsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/purchases"
        element={
          <ProtectedShell permission="purchaseInvoices" feature="purchaseInvoices">
            <PurchaseInvoicesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/purchases/new"
        element={
          <ProtectedShell permission="purchaseInvoices" permissionAction="add" feature="purchaseInvoices">
            <PurchaseInvoiceNewPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/purchases/:id"
        element={
          <ProtectedShell permission="purchaseInvoices" feature="purchaseInvoices">
            <PurchaseInvoiceDetailPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/purchases/:id/edit"
        element={
          <ProtectedShell permission="purchaseInvoices" permissionAction="edit" feature="purchaseInvoices">
            <PurchaseInvoiceEditPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/sales"
        element={
          <ProtectedShell permission="salesInvoices" feature="salesInvoices">
            <SalesInvoicesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/sales/new"
        element={
          <ProtectedShell permission="salesInvoices" permissionAction="add" feature="salesInvoices">
            <SalesInvoiceNewPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/sales/:id"
        element={
          <ProtectedShell permission="salesInvoices" feature="salesInvoices">
            <SalesInvoiceDetailPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/sales/:id/edit"
        element={
          <ProtectedShell permission="salesInvoices" permissionAction="edit" feature="salesInvoices">
            <SalesInvoiceEditPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/import"
        element={
          <ProtectedShell>
            <ImportPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/stocktakes"
        element={
          <ProtectedShell permission="inventory" feature="stocktakes">
            <StocktakesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/stocktakes/:id"
        element={
          <ProtectedShell permission="inventory" feature="stocktakes">
            <StocktakeDetailPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/quotations"
        element={
          <ProtectedShell permission="salesInvoices" feature="quotations">
            <QuotationsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/quotations/new"
        element={
          <ProtectedShell permission="salesInvoices" permissionAction="add" feature="quotations">
            <QuotationNewPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/quotations/:id/edit"
        element={
          <ProtectedShell permission="salesInvoices" permissionAction="edit" feature="quotations">
            <QuotationEditPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/quotations/:id"
        element={
          <ProtectedShell permission="salesInvoices" feature="quotations">
            <QuotationDetailPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/returns"
        element={
          <ProtectedShell permission="returns" feature="returns">
            <ReturnsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/alerts"
        element={
          <ProtectedShell permission="alerts" feature="alerts">
            <AlertsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/drivers"
        element={
          <ProtectedShell permission="drivers" feature="drivers">
            <DriversPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/cashbox"
        element={
          <ProtectedShell permission="cashbox" feature="cashbox">
            <CashboxPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/dues"
        element={
          <ProtectedShell permission="reports" feature="dues">
            <DuesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedShell permission="reports" feature="reports">
            <ReportsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/reports/employees"
        element={
          <ProtectedShell ownerOnly feature="employeesReport">
            <EmployeeReportPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/audit-log"
        element={
          <ProtectedShell ownerOnly>
            <AuditLogPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedShell ownerOnly>
            <SettingsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedShell ownerOnly>
            <UsersPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/my-profile"
        element={
          <ProtectedShell>
            <EmployeeProfilePage />
          </ProtectedShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
