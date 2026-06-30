import { useState } from "react";
import { AlertCircle, Loader2, Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  usePolicies,
  useCreatePolicy,
  useUpdatePolicy,
  useDeletePolicy,
  type Policy,
  type PolicyInput,
} from "@/hooks/useGovernance";
import { useArtifacts } from "@/hooks/useArtifact";

const policyFormSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  policy_type: z.string().min(1, "Tipo obrigatório").max(100),
  is_active: z.boolean().default(true),
  entity_id: z.string().min(1, "Artefato obrigatório"),
});

type PolicyFormValues = z.infer<typeof policyFormSchema>;

function PolicyForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = "Salvar",
}: {
  defaultValues?: Partial<PolicyFormValues>;
  onSubmit: (v: PolicyFormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}) {
  const { data: artifacts } = useArtifacts();

  const { register, handleSubmit, control, formState: { errors } } = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: { name: "", description: "", policy_type: "", is_active: true, entity_id: "", ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input placeholder="ex: Aprovação de Deploy em Produção" {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Input placeholder="ex: release_approval, security_review" {...register("policy_type")} />
          {errors.policy_type && <p className="text-xs text-destructive">{errors.policy_type.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Artefato vinculado</Label>
        <Controller
          control={control}
          name="entity_id"
          render={({ field }) => (
            <Select value={field.value} onChange={(e) => field.onChange(e.target.value)}>
              <option value="">Selecione um artefato…</option>
              {(artifacts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        />
        {errors.entity_id && <p className="text-xs text-destructive">{errors.entity_id.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea
          placeholder="Descreva o critério ou regra desta política"
          rows={3}
          {...register("description")}
        />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="is_active" {...register("is_active")} className="rounded" />
        <Label htmlFor="is_active" className="cursor-pointer">Ativa</Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function ArtifactName({ artifactId, artifacts }: { artifactId: string | null | undefined; artifacts: { id: string; name: string }[] }) {
  if (!artifactId) return <>—</>;
  const found = artifacts.find((a) => a.id === artifactId);
  return <>{found?.name ?? artifactId.slice(0, 8) + "…"}</>;
}

export default function PoliciesPage() {
  const { data: policies, isLoading, isError } = usePolicies();
  const { data: artifacts } = useArtifacts();
  const createPolicy = useCreatePolicy();
  const deletePolicy = useDeletePolicy();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleCreate(values: PolicyFormValues) {
    const payload: PolicyInput = {
      ...values,
      entity_type: "artifact",
      entity_id: values.entity_id as unknown as undefined,
    };
    createPolicy.mutate(payload, { onSuccess: () => setShowCreate(false) });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Políticas de Governança</h1>
          <p className="text-muted-foreground">
            Regras de negócio vinculadas a artefatos — definem critérios de aprovação para transições controladas.
          </p>
        </div>
        <Button onClick={() => { setShowCreate(true); setEditingId(null); }}>
          <Plus className="mr-2 h-4 w-4" /> Nova política
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Nova política</CardTitle>
            <CardDescription>Vincula uma regra de aprovação a um artefato específico.</CardDescription>
          </CardHeader>
          <CardContent>
            <PolicyForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreate(false)}
              isSubmitting={createPolicy.isPending}
              submitLabel="Criar política"
            />
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" /> Falha ao carregar políticas.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && policies?.length === 0 && !showCreate && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nenhuma política cadastrada</p>
            <p className="text-sm text-muted-foreground">Crie a primeira política para vincular a aprovações.</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova política
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && policies && policies.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Artefato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <>
                    <TableRow key={policy.id}>
                      <TableCell className="font-medium">{policy.name}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {policy.policy_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <ArtifactName artifactId={policy.entity_id?.toString()} artifacts={artifacts ?? []} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={policy.is_active ? "success" : "secondary"}>
                          {policy.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-sm truncate">
                        {policy.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(editingId === policy.id ? null : policy.id)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Excluir política "${policy.name}"?`))
                                deletePolicy.mutate(policy.id);
                            }}
                            disabled={deletePolicy.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {editingId === policy.id && (
                      <TableRow key={`edit-${policy.id}`}>
                        <TableCell colSpan={6} className="bg-muted/20 p-4">
                          <EditPolicyRow
                            policy={policy}
                            onDone={() => setEditingId(null)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EditPolicyRow({ policy, onDone }: { policy: Policy; onDone: () => void }) {
  const updatePolicy = useUpdatePolicy(policy.id);
  function handleUpdate(values: PolicyFormValues) {
    const payload: PolicyInput = {
      ...values,
      entity_type: "artifact",
      entity_id: values.entity_id as unknown as undefined,
    };
    updatePolicy.mutate(payload, { onSuccess: onDone });
  }
  return (
    <PolicyForm
      defaultValues={{
        name: policy.name,
        description: policy.description ?? "",
        policy_type: policy.policy_type,
        is_active: policy.is_active,
        entity_id: policy.entity_id?.toString() ?? "",
      }}
      onSubmit={handleUpdate}
      onCancel={onDone}
      isSubmitting={updatePolicy.isPending}
      submitLabel="Salvar alterações"
    />
  );
}
