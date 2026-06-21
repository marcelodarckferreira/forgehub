const KANBOARD_URL = (import.meta.env.VITE_KANBOARD_URL as string | undefined) ?? "http://localhost:8081";

export default function KanboardPage() {
  return (
    <div className="h-[calc(100vh-7rem)] overflow-hidden rounded-lg border border-border">
      <iframe src={KANBOARD_URL} title="Kanboard" className="h-full w-full" />
    </div>
  );
}
