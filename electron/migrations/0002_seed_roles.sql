-- Phase 1: seed system roles and role permissions.

INSERT OR IGNORE INTO roles (id, name, is_system) VALUES
  ('owner', 'Owner/Admin', 1),
  ('cashier', 'Cashier/Operator', 1);

INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
SELECT 'owner', key FROM permissions;

INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES
  ('cashier', 'queue.manage'),
  ('cashier', 'invoice.create'),
  ('cashier', 'invoice.finalize');
