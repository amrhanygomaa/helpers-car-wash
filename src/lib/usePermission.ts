import { useAuth } from "../store/AuthContext";
import { hasPermissionKey, type PermissionKey } from "./permissions";

/**
 * Returns true if the current user holds the given permission key.
 * Owner always returns true; unauthenticated always returns false.
 * Use this instead of checking role names directly.
 */
export function usePermission(key: PermissionKey): boolean {
  const { currentUser } = useAuth();
  return hasPermissionKey(currentUser, key);
}
