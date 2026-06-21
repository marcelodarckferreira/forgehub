import { useState } from "react";
import { FileText, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  PROFILE_MARKDOWN_FILES,
  useProfileFile,
  useUpdateProfileFile,
  type ProfileMarkdownFile,
} from "@/hooks/useFoundation";

const TAB_LABELS: Record<ProfileMarkdownFile, string> = {
  "SOUL.md": "Soul",
  "MEMORY.md": "Memory",
  "TOOLS.md": "Tools",
  "AGENTS.md": "Agents",
  "HEARTBEAT.md": "Heartbeat",
  "USER.md": "User",
};

function ProfileFileEditor({
  profileSlug,
  filename,
}: {
  profileSlug: string;
  filename: ProfileMarkdownFile;
}) {
  const { data, isLoading, isError, error } = useProfileFile(profileSlug, filename);
  const updateFile = useUpdateProfileFile(profileSlug, filename);
  const [draft, setDraft] = useState<string | null>(null);

  const savedContent = data?.content ?? "";
  const content = draft ?? savedContent;
  const isDirty = draft !== null && draft !== savedContent;

  function handleSave() {
    updateFile.mutate(content, {
      onSuccess: () => setDraft(null),
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading {filename}…
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-4 text-sm text-destructive">
        Failed to load {filename}: {(error as Error)?.message}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data?.content === null && (
        <p className="text-sm italic text-muted-foreground">
          {filename} does not exist yet for this profile. Saving will create it.
        </p>
      )}
      <Textarea
        value={content}
        onChange={(e) => setDraft(e.target.value)}
        rows={16}
        className="font-mono text-xs"
        placeholder={`# ${filename}`}
      />
      <div className="flex items-center justify-end gap-3">
        {updateFile.isError && (
          <p className="text-sm text-destructive">
            Failed to save: {(updateFile.error as Error)?.message}
          </p>
        )}
        {updateFile.isSuccess && !isDirty && (
          <p className="text-sm text-muted-foreground">Saved.</p>
        )}
        <Button onClick={handleSave} disabled={!isDirty || updateFile.isPending} size="sm">
          {updateFile.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

export function ProfileFilesCard({ profileSlug }: { profileSlug: string }) {
  const [activeTab, setActiveTab] = useState<ProfileMarkdownFile>("SOUL.md");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <FileText className="h-5 w-5" />
          Profile files
        </CardTitle>
        <CardDescription>
          This agent's Hermes profile Markdown config files (
          <code>/root/.hermes/profiles/{profileSlug}/</code>).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProfileMarkdownFile)}>
          <TabsList>
            {PROFILE_MARKDOWN_FILES.map((file) => (
              <TabsTrigger key={file} value={file}>
                {TAB_LABELS[file]}
              </TabsTrigger>
            ))}
          </TabsList>
          {PROFILE_MARKDOWN_FILES.map((file) => (
            <TabsContent key={file} value={file} className="mt-4">
              <ProfileFileEditor profileSlug={profileSlug} filename={file} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
