import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../store/AuthContext";
import { AppLayout } from "./AppLayout";
import { useToast } from "../ui/Toast";
import { hasPermission } from "../../lib/permissions";
import type { UserPermissions } from "../../types";

export function ProtectedShell({
  children,
  permission,
  permissionAction = "view",
  ownerOnly,
}: {
  children: React.ReactNode;
  permission?: keyof UserPermissions;
  permissionAction?: string;
  ownerOnly?: boolean;
}) {
  const { auth, currentUser } = useAuth();
  const loc = useLocation();
  const toast = useToast();

  if (!auth.isAuthenticated || !currentUser) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }

  if (currentUser.role !== "owner") {
    if (ownerOnly) {
      setTimeout(() => toast.error("ليس لديك صلاحية", "هذه الصفحة مخصصة للمدير فقط"), 0);
      return <Navigate to="/" replace />;
    }
    if (permission && !hasPermission(currentUser, permission, permissionAction)) {
      setTimeout(() => toast.error("ليس لديك صلاحية", "لا تملك صلاحية لفتح هذه الصفحة"), 0);
      return <Navigate to="/" replace />;
    }
  }

  return <AppLayout>{children}</AppLayout>;
}
