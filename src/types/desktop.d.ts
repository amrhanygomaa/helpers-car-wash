import type { AppUser, LicenseStatus, LoginResult, QueueTicket } from "./index";

export {};

export interface SyncConfig {
  enabled: boolean;
  url: string | null;
  key: string | null;
  orgId: string | null;
  branchId: string;
}

export interface SyncStatus {
  enabled: boolean;
  configured: boolean;
  branchId: string;
  orgId: string | null;
  url: string | null;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

declare global {
  interface Window {
    desktopAPI?: {
      platform: "electron";
      license: {
        getMachineCode: () => Promise<string>;
        getStatus: () => Promise<LicenseStatus>;
        activate: (serial: string) => Promise<{ ok: boolean; status: LicenseStatus }>;
      };
      setup: {
        createOwner: (
          username: string,
          password: string
        ) => Promise<{ ok: boolean; user?: AppUser; error?: string }>;
        hasOwner: () => Promise<boolean>;
        selectDirectory: () => Promise<string | null>;
      };
      auth: {
        login: (
          username: string,
          password: string
        ) => Promise<LoginResult & { user?: AppUser }>;
        devLogin?: () => Promise<LoginResult & { user?: AppUser }>;
        logout: () => Promise<{ ok: boolean }>;
        hashPassword: (password: string) => Promise<string>;
        changePassword: (
          userId: string,
          currentPassword: string,
          newPassword: string
        ) => Promise<{
          ok: boolean;
          user?: AppUser;
          error?: "invalid_input" | "user_missing" | "invalid_current_password" | "not_authorized";
        }>;
        updateProfile: (
          userId: string,
          name: string,
          currentPassword?: string,
          newPassword?: string
        ) => Promise<{
          ok: boolean;
          user?: AppUser;
          error?: "invalid_input" | "user_missing" | "invalid_current_password" | "not_authorized";
        }>;
        resetOwnerPassword: (
          supportCode: string,
          username: string,
          password: string
        ) => Promise<{
          ok: boolean;
          user?: AppUser;
          error?:
            | "invalid_support_code"
            | "machine_mismatch"
            | "support_code_expired"
            | "owner_missing"
            | "invalid_input"
            | "rate_limited";
          remainSeconds?: number;
        }>;
      };
      print: {
        route: (route: string) => Promise<{ ok: boolean; error?: string }>;
        testReceipt: () => Promise<{ ok: boolean; error?: string }>;
        intakeTicket: (payload: {
          ticket: QueueTicket;
          carsAhead: number;
          services: string[];
        }) => Promise<{ ok: boolean; error?: string }>;
      };
      storage: {
        get: (key: string) => string | null;
        set: (key: string, value: string) => boolean;
        remove: (key: string) => boolean;
        clearPrefix: (prefix: string) => boolean;
        export: () => Promise<{
          version: number;
          timestamp: string;
          rows: { key: string; value: string; updated_at: string }[];
        }>;
        import: (payload: unknown) => Promise<{ ok: boolean }>;
        getBatch: () => Promise<Record<string, string>>;
        setBatch: (entries: Record<string, string>) => Promise<boolean>;
      };
      /** Relational data bridge for the car wash domain (Drizzle sqlite-proxy). */
      db: {
        query: (
          sql: string,
          params: unknown[],
          method: "run" | "all" | "values" | "get"
        ) => Promise<{ rows: unknown[] }>;
        batch: (
          queries: { sql: string; params: unknown[]; method: "run" | "all" | "values" | "get" }[]
        ) => Promise<{ rows: unknown[] }[]>;
      };
      sync?: {
        status: () => Promise<SyncStatus>;
        getConfig: () => Promise<SyncConfig>;
        setConfig: (cfg: Partial<SyncConfig>) => Promise<SyncStatus>;
        now: () => Promise<{ ok: boolean; reason?: string; error?: string; pushed?: number; pulled?: number }>;
      };
      backup: {
        writeFile: (
          dir: string,
          fileName: string,
          content: string
        ) => Promise<{ ok: boolean; path?: string; error?: string }>;
        selectDirectory: () => Promise<string | null>;
        exportDatabase: () => Promise<{ ok: boolean; path?: string; error?: string }>;
        importDatabase: () => Promise<{
          ok: boolean;
          restartRequired?: boolean;
          error?: string;
        }>;
      };
      app: {
        onRunCloseBackup: (cb: () => void) => () => void;
        closeBackupDone: () => void;
      };
    };
  }
}
