import { hasDemoContent } from "@/server/catalog";

export async function DemoBanner({ text }: { text: string }) {
  let show = false;
  try {
    show = await hasDemoContent();
  } catch {
    show = process.env.DEPLOY_ENV !== "production";
  }
  if (!show) return null;
  return (
    <div role="status" className="bg-brass-tint px-4 py-2 text-center text-xs font-medium text-brass sm:text-sm">
      {text}
    </div>
  );
}
