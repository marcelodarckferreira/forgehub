import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  is_admin: boolean;
  profile_id: string | null;
}

export interface ModulePermission {
  can_view: boolean;
  can_query: boolean;
  can_write: boolean;
  can_delete: boolean;
}

export type PermissionMap = Record<string, ModulePermission>;

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  permissions: PermissionMap;
  setAuth: (token: string, user: AuthUser, permissions: PermissionMap) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      permissions: {},
      setAuth: (token, user, permissions) => set({ token, user, permissions }),
      clearAuth: () => set({ token: null, user: null, permissions: {} }),
    }),
    { name: "forgehub-auth" }
  )
);
