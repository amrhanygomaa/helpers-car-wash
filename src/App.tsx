import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./store/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { ActivationPage } from "./pages/ActivationPage";
import { FirstRunSetupPage } from "./pages/FirstRunSetupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CustomerMarketingPage } from "./pages/CustomerMarketingPage";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { ServicesPage } from "./pages/ServicesPage";
import { CarwashInvoiceNewPage } from "./pages/CarwashInvoiceNewPage";
import { CarwashProductsPage } from "./pages/CarwashProductsPage";
import { CarwashMaterialsPage } from "./pages/CarwashMaterialsPage";
import { CashShiftPage } from "./pages/CashShiftPage";
import { EndOfDayPage } from "./pages/EndOfDayPage";
import { AttendancePage } from "./pages/AttendancePage";
import { QueuePage } from "./pages/QueuePage";
import { CarwashReportsPage } from "./pages/CarwashReportsPage";
import { SalesInvoicesPage } from "./pages/SalesInvoicesPage";
import { SalesInvoiceDetailPage } from "./pages/SalesInvoiceDetailPage";
import { SalesInvoicePrintPage } from "./pages/SalesInvoicePrintPage";
import { CashboxPage } from "./pages/CashboxPage";
import { EmployeeReportPage } from "./pages/EmployeeReportPage";
import { PayrollDayClosePage } from "./pages/PayrollDayClosePage";
import { BranchesPage } from "./pages/BranchesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { EmployeeProfilePage } from "./pages/EmployeeProfilePage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { WorkerDetailPage } from "./pages/WorkerDetailPage";
import { WorkersPage } from "./pages/WorkersPage";
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

      {/* Dashboard */}
      <Route
        path="/"
        element={
          <ProtectedShell>
            <DashboardPage />
          </ProtectedShell>
        }
      />

      {/* Queue */}
      <Route
        path="/queue"
        element={
          <ProtectedShell permission="queue" feature="carwashQueue">
            <QueuePage />
          </ProtectedShell>
        }
      />

      {/* Carwash invoicing */}
      <Route
        path="/carwash/new"
        element={
          <ProtectedShell permission="salesInvoices" permissionAction="add" feature="washServices">
            <CarwashInvoiceNewPage />
          </ProtectedShell>
        }
      />

      {/* Invoice list + detail */}
      <Route
        path="/sales"
        element={
          <ProtectedShell permission="salesInvoices" feature="salesInvoices">
            <SalesInvoicesPage />
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

      {/* Services catalog */}
      <Route
        path="/services"
        element={
          <ProtectedShell permission="washServices" feature="washServices">
            <ServicesPage />
          </ProtectedShell>
        }
      />

      {/* Carwash products & materials */}
      <Route
        path="/carwash/products"
        element={
          <ProtectedShell permissionKey="products.view" feature="washServices">
            <CarwashProductsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/carwash/materials"
        element={
          <ProtectedShell permissionKey="materials.view" feature="washServices">
            <CarwashMaterialsPage />
          </ProtectedShell>
        }
      />
      {/* Customers */}
      <Route
        path="/customers"
        element={
          <ProtectedShell permission="customers" feature="customers">
            <CustomersPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/customers/:id"
        element={
          <ProtectedShell permission="customers" feature="customers">
            <CustomerDetailPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/customers/marketing"
        element={
          <ProtectedShell permission="customers" feature="customers">
            <CustomerMarketingPage />
          </ProtectedShell>
        }
      />

      {/* Finance */}
      <Route
        path="/cashbox"
        element={
          <ProtectedShell permission="cashbox" feature="cashbox">
            <CashboxPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/cashbox/shift"
        element={
          <ProtectedShell permission="cashbox" feature="cashbox">
            <CashShiftPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/payroll/day-close"
        element={
          <ProtectedShell permissionKey="payroll.manage">
            <PayrollDayClosePage />
          </ProtectedShell>
        }
      />
      <Route
        path="/reports/end-of-day"
        element={
          <ProtectedShell permission="reports" feature="reports">
            <EndOfDayPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/workers"
        element={
          <ProtectedShell permissionKey="payroll.manage">
            <WorkersPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/workers/attendance"
        element={
          <ProtectedShell permissionKey="payroll.manage">
            <AttendancePage />
          </ProtectedShell>
        }
      />

      {/* Reports */}
      <Route
        path="/carwash/reports"
        element={
          <ProtectedShell permission="reports" feature="washServices">
            <CarwashReportsPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/reports/employees"
        element={
          <ProtectedShell permissionKey="payroll.manage" feature="employeesReport">
            <EmployeeReportPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/workers/:id"
        element={
          <ProtectedShell permissionKey="payroll.manage">
            <WorkerDetailPage />
          </ProtectedShell>
        }
      />

      {/* Admin */}
      <Route
        path="/branches"
        element={
          <ProtectedShell permissionKey="settings.manage">
            <BranchesPage />
          </ProtectedShell>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedShell permissionKey="settings.manage">
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
        path="/audit-log"
        element={
          <ProtectedShell ownerOnly>
            <AuditLogPage />
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
