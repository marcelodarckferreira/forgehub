import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuthStore, type AuthUser } from "@/store/authStore";

interface TokenOut {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

interface LoginPayload {
  username: string;
  password: string;
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const qc = useQueryClient();

  return useMutation<TokenOut, Error, LoginPayload>({
    mutationFn: async ({ username, password }) => {
      const form = new URLSearchParams();
      form.append("username", username);
      form.append("password", password);
      const res = await fetch(
        `${(import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000"}/api/v1/auth/token`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? "Login failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      qc.clear();
    },
  });
}

export function useUsers() {
  return useQuery<AuthUser[]>({
    queryKey: ["users"],
    queryFn: () => apiClient.get("/api/v1/users"),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation<AuthUser, Error, { username: string; password: string; email?: string; full_name?: string; is_admin?: boolean }>({
    mutationFn: (body) => apiClient.post("/api/v1/users", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation<AuthUser, Error, { id: string; body: Partial<{ email: string; full_name: string; is_active: boolean; is_admin: boolean; password: string }> }>({
    mutationFn: ({ id, body }) => apiClient.patch(`/api/v1/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete(`/api/v1/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
