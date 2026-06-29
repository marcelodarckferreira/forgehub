import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Eye,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  ScrollText,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cronJobKeys,
  useDeleteCronJob,
  useFoundationCrons,
  useUpdateCronJob,
  type CronJob,
} from "@/hooks/useFoundationCrons";
import {
  fetchScriptContentWithFallback,
  scriptKeys,
  useFoundationScripts,
  useScriptFileContent,
  useSyncScripts,
  type Script,
  type ScriptLocationRef,
} from "@/hooks/useFoundationScripts";
import { useChatHandoffStore } from "@/store/chatHandoff";
import { useQueryClient } from "@tanstack/react-query";

const CRON_STATUS_VARIANT: Record<CronJob["status"], "success" | "warning" | "outline"> = {
  active: "success",
  paused: "warning",
  disabled: "outline",
};

const CRON_STATUS_LABEL: Record<CronJob["status"], string> = {
  active: "Active",
  paused: "Paused",
  disabled: "Disabled",
};

const SCRIPT_STATUS_VARIANT: Record<Script["status"], "success" | "destructive" | "outline"> = {
  ok: "success",
  broken: "destructive",
  unused: "outline",
};

const SCRIPT_STATUS_LABEL: Record<Script["status"], string> = {
  ok: "OK",
  broken: "Broken",
  unused: "Unused",
};

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildCronChatMessage(job: CronJob, fileContent: string | null, filePath: string | null): string {
  const lines: string[] = [
    "I need help adjusting this Hermes cron job. Please review it and suggest fixes.",
    "",
    `Task: ${job.name}`,
    `Profile: ${job.profile}`,
    `Schedule: ${job.schedule_display ?? "—"}`,
    `Status: ${job.status}`,
  ];
  if (job.deliver) lines.push(`Deliver: ${job.deliver}`);
  if (job.description) lines.push(`Description: ${job.description}`);

  if (job.script) {
    lines.push("", `Script: ${job.script}`);
    if (fileContent != null) {
      if (filePath) lines.push(`Path: ${filePath}`);
      lines.push("", "```", fileContent, "```");
    } else {
      lines.push("(Could not read the script file content -- it may be missing or broken.)");
    }
  }
  return lines.join("\n");
}

function buildScriptChatMessage(script: Script, fileContent: string | null): string {
  const lines: string[] = [
    "I need help with this Hermes script. Please review its functionality and suggest improvements.",
    "",
    `Script: ${script.name}`,
    `Location: ${script.location === "central" ? "central catalog" : script.location}`,
    `Executing agent: ${script.agent ?? "—"}`,
    `Path: ${script.path}`,
    `Status: ${script.status}`,
  ];
  if (script.description) lines.push(`Description: ${script.description}`);
  lines.push("");

  if (fileContent != null) {
    lines.push("```", fileContent, "```");
  } else {
    lines.push("(Could not read the script file content -- it may be missing or broken.)");
  }
  return lines.join("\n");
}

function FileViewerOverlay({
  title,
  subtitle,
  candidates,
  onClose,
}: {
  title: string;
  subtitle?: string;
  candidates: ScriptLocationRef[];
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useScriptFileContent(candidates, true);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!data?.content) return;
    await navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{title}</h3>
            <p className="truncate text-xs text-muted-foreground">{data?.path ?? subtitle ?? ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!data?.content}>
              {copied ? (
                <Check className="mr-2 h-3.5 w-3.5" />
              ) : (
                <Copy className="mr-2 h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading file…
            </div>
          )}
          {isError && (
            <p className="text-sm text-destructive">{(error as Error)?.message ?? "Failed to load file."}</p>
          )}
          {data?.content != null && (
            <pre className="whitespace-pre-wrap break-all text-xs">
              <code>{data.content}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

interface EditForm {
  name: string;
  description: string;
  schedule_display: string;
  deliver: string;
  enabled: boolean;
}

function CronEditPanel({
  job,
  onClose,
}: {
  job: CronJob;
  onClose: () => void;
}) {
  const updateJob = useUpdateCronJob();
  const [form, setForm] = useState<EditForm>({
    name: job.name,
    description: job.description ?? "",
    schedule_display: job.schedule_display ?? "",
    deliver: job.deliver ?? "",
    enabled: job.status !== "disabled",
  });

  function handleSave() {
    updateJob.mutate(
      {
        jobId: job.id,
        updates: {
          name: form.name,
          description: form.description,
          schedule_display: form.schedule_display,
          deliver: form.deliver,
          enabled: form.enabled,
        },
      },
      { onSuccess: onClose }
    );
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Edit task: {job.name}</h3>
          <Button variant="ghost" size="icon" aria-label="Cancel" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {updateJob.isError && (
          <p className="text-sm text-destructive">{(updateJob.error as Error)?.message}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Interval (cron expression)
            </label>
            <Input
              value={form.schedule_display}
              onChange={(e) => setForm((f) => ({ ...f, schedule_display: e.target.value }))}
              placeholder="*/5 * * * *"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Delivery (deliver)</label>
            <Input
              value={form.deliver}
              onChange={(e) => setForm((f) => ({ ...f, deliver: e.target.value }))}
              placeholder="local, telegram, telegram:chat_id…"
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input
              id={`enabled-${job.id}`}
              type="checkbox"
              className="h-4 w-4"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            <label htmlFor={`enabled-${job.id}`} className="text-sm">
              Enabled
            </label>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Description / prompt</label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={4}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateJob.isPending}>
            {updateJob.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CronsTab() {
  const { data: jobs, isLoading, isError, error } = useFoundationCrons();
  const deleteJob = useDeleteCronJob();
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [viewingJob, setViewingJob] = useState<CronJob | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const setDraft = useChatHandoffStore((s) => s.setDraft);
  const navigate = useNavigate();

  function handleDelete(job: CronJob) {
    if (!window.confirm(`Delete the cron "${job.name}" (profile ${job.profile})? This action cannot be undone.`))
      return;
    deleteJob.mutate(job.id);
  }

  async function handleSendToChat(job: CronJob) {
    setSendingId(job.id);
    try {
      const candidates: ScriptLocationRef[] = job.script
        ? [
            { location: job.profile, name: job.script },
            { location: "central", name: job.script },
          ]
        : [];
      const fileResult = candidates.length > 0 ? await fetchScriptContentWithFallback(candidates) : null;
      setDraft(buildCronChatMessage(job, fileResult?.content ?? null, fileResult?.path ?? null));
      navigate("/workspace");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {editingJob && <CronEditPanel job={editingJob} onClose={() => setEditingJob(null)} />}
      {viewingJob && (
        <FileViewerOverlay
          title={`${viewingJob.name} — ${viewingJob.script ?? "no script"}`}
          candidates={
            viewingJob.script
              ? [
                  { location: viewingJob.profile, name: viewingJob.script },
                  { location: "central", name: viewingJob.script },
                ]
              : []
          }
          onClose={() => setViewingJob(null)}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading crons…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load crons: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && jobs && jobs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Clock className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No crons found</p>
              <p className="text-sm text-muted-foreground">
                No jobs registered in the shared `hermes cron` store.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && jobs && jobs.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <span className="font-medium">{job.name}</span>
                      {job.description && (
                        <p
                          className="max-w-md truncate text-xs text-muted-foreground"
                          title={job.description}
                        >
                          {job.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{job.profile}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <code className="text-xs">{job.schedule_display ?? "—"}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={CRON_STATUS_VARIANT[job.status]}>
                        {CRON_STATUS_LABEL[job.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatTimestamp(job.next_run_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span
                        className={
                          job.last_status === "error" ? "text-destructive" : "text-muted-foreground"
                        }
                      >
                        {formatTimestamp(job.last_run_at)}
                        {job.last_status ? ` (${job.last_status})` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`View file for ${job.name}`}
                        disabled={!job.script}
                        title={job.script ? `View ${job.script}` : "No script attached"}
                        onClick={() => setViewingJob(job)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Send ${job.name} to chat`}
                        disabled={sendingId === job.id}
                        title="Send data and file to chat"
                        onClick={() => handleSendToChat(job)}
                      >
                        {sendingId === job.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MessageSquare className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${job.name}`}
                        onClick={() => setEditingJob(job)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${job.name}`}
                        disabled={deleteJob.isPending}
                        onClick={() => handleDelete(job)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScriptsTab() {
  const { data: scripts, isLoading, isError, error } = useFoundationScripts();
  const [viewingScript, setViewingScript] = useState<Script | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const setDraft = useChatHandoffStore((s) => s.setDraft);
  const navigate = useNavigate();

  async function handleSendToChat(script: Script) {
    const key = `${script.location}-${script.name}`;
    setSendingKey(key);
    try {
      const fileResult = await fetchScriptContentWithFallback([
        { location: script.location, name: script.name },
      ]);
      setDraft(buildScriptChatMessage(script, fileResult?.content ?? null));
      navigate("/workspace");
    } finally {
      setSendingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {viewingScript && (
        <FileViewerOverlay
          title={viewingScript.name}
          subtitle={viewingScript.path}
          candidates={[{ location: viewingScript.location, name: viewingScript.name }]}
          onClose={() => setViewingScript(null)}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading scripts…
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load scripts: {(error as Error)?.message}</span>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && scripts && scripts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ScrollText className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No scripts found</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && scripts && scripts.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Script</TableHead>
                  <TableHead>Executing agent</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Used by</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scripts.map((script) => {
                  const key = `${script.location}-${script.name}`;
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        <span className="font-medium">{script.name}</span>
                        {script.description && (
                          <p className="max-w-sm truncate text-xs text-muted-foreground" title={script.description}>
                            {script.description}
                          </p>
                        )}
                        {!script.description && (
                          <p className="text-xs italic text-muted-foreground">Functionality not documented</p>
                        )}
                        {script.status === "broken" && (
                          <p className="text-xs text-destructive" title={script.symlink_target ?? undefined}>
                            {script.escapes_scripts_dir
                              ? "Symlink escapes the allowed scripts directory"
                              : "Script not found at the expected path"}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{script.agent ?? "—"}</TableCell>
                      <TableCell className="max-w-xs text-xs text-muted-foreground">
                        <code className="break-all" title={script.symlink_target ?? script.path}>
                          {script.path}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={SCRIPT_STATUS_VARIANT[script.status]}>
                          {SCRIPT_STATUS_LABEL[script.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {script.referenced_by.length === 0
                          ? "—"
                          : script.referenced_by
                              .map((ref) => `${ref.job_name} (${ref.profile})`)
                              .join(", ")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View file for ${script.name}`}
                          title={`View ${script.name}`}
                          onClick={() => setViewingScript(script)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Send ${script.name} to chat`}
                          disabled={sendingKey === key}
                          title="Send data and file to chat"
                          onClick={() => handleSendToChat(script)}
                        >
                          {sendingKey === key ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageSquare className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CronsPage() {
  const [tab, setTab] = useState("crons");
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const { sync: syncScripts } = useSyncScripts();

  async function handleSync() {
    setIsSyncing(true);
    try {
      await syncScripts();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cronJobKeys.list }),
        queryClient.invalidateQueries({ queryKey: scriptKeys.list }),
      ]);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Crons</h1>
          <p className="text-muted-foreground">
            Scheduled tasks and scripts (`hermes cron`) across every Hermes profile, with
            description, interval, executing agent, and run status.
          </p>
        </div>
        <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="crons">Crons</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
        </TabsList>
        <TabsContent value="crons" className="mt-4">
          <CronsTab />
        </TabsContent>
        <TabsContent value="scripts" className="mt-4">
          <ScriptsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
