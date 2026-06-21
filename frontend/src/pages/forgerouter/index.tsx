const FORGEROUTER_URL =
  (import.meta.env.VITE_FORGEROUTER_URL as string | undefined) ?? "http://localhost:2100";

export default function ForgeRouterPage() {
  return (
    <div className="h-[calc(100vh-7rem)] overflow-hidden rounded-lg border border-border">
      <iframe src={FORGEROUTER_URL} title="ForgeRouter" className="h-full w-full" />
    </div>
  );
}
