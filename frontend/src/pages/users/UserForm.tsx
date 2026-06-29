import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthUser } from "@/store/authStore";
import { useCreateUser, useUpdateUser } from "@/hooks/useAuth";

interface Props {
  user?: AuthUser;
  onClose: () => void;
}

export default function UserForm({ user, onClose }: Props) {
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [isAdmin, setIsAdmin] = useState(user?.is_admin ?? false);
  const [isActive, setIsActive] = useState(user?.is_active ?? true);

  const createMut = useCreateUser();
  const updateMut = useUpdateUser();
  const isPending = createMut.isPending || updateMut.isPending;
  const error = createMut.error ?? updateMut.error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (user) {
        await updateMut.mutateAsync({
          id: user.id,
          body: {
            ...(password ? { password } : {}),
            email: email || undefined,
            full_name: fullName || undefined,
            is_admin: isAdmin,
            is_active: isActive,
          },
        });
      } else {
        await createMut.mutateAsync({
          username,
          password,
          email: email || undefined,
          full_name: fullName || undefined,
          is_admin: isAdmin,
        });
      }
      onClose();
    } catch {
      // shown below
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
      {!user && (
        <div className="flex flex-col gap-1">
          <Label>Usuário *</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="jdoe" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label>{user ? "Nova senha (opcional)" : "Senha *"}</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!user}
          placeholder={user ? "deixar em branco para manter" : "••••••••"}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Nome completo</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João da Silva" />
      </div>
      <div className="flex flex-col gap-1">
        <Label>E-mail</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@exemplo.com" />
      </div>
      <div className="flex items-center gap-4 col-span-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-sm">Administrador</span>
        </label>
        {user && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm">Ativo</span>
          </label>
        )}
      </div>

      {error && <p className="col-span-2 text-xs text-destructive">{error.message}</p>}

      <div className="col-span-2 flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}
