import type { AppUser, LicenseStatus } from "./index";

export {};

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
        ) => Promise<{ ok: boolean; user?: AppUser }>;
        hashPassword: (password: string) => Promise<string>;
        resetOwnerPassword: (
          supportCode: string,
          username: string,
          password: string
        ) => Promise<{ ok: boolean; user?: AppUser; error?: string }>;
      };
      print: {
        route: (route: string) => Promise<{ ok: boolean; error?: string }>;
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
      };
    };
  }
}
