import Link from "next/link";
import { requireStaff } from "@/server/auth/session";
import { can, type Permission } from "@/lib/rbac";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; perm?: Permission }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/appointments", label: "Appointments", perm: "appointments:read" },
  { href: "/admin/patients", label: "Patients", perm: "patients:read_contact" },
  { href: "/admin/schedule", label: "Schedule", perm: "availability:manage" },
  { href: "/admin/pricing", label: "Services & pricing", perm: "pricing:manage" },
  { href: "/admin/payments", label: "Payments", perm: "payments:read" },
  { href: "/admin/content", label: "Content", perm: "content:edit" },
  { href: "/admin/seo", label: "SEO", perm: "analytics:read" },
  { href: "/admin/analytics", label: "Analytics & revenue", perm: "analytics:read" },
  { href: "/admin/settings", label: "Settings & compliance", perm: "settings:compliance" },
  { href: "/admin/audit", label: "Audit log", perm: "audit:read" },
];

export default async function Console({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const items = NAV.filter((n) => !n.perm || can(user.roles, n.perm));
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[250px_1fr]">
      <aside className="border-b border-line bg-ink text-white lg:border-e lg:border-b-0">
        <div className="flex items-center justify-between p-5 lg:block">
          <Link href="/admin" className="font-display text-lg">Dr. Ensiyeh Rahimi</Link>
          <p className="text-xs text-white/60 lg:mt-1">{user.displayName ?? user.email} · {user.roles.join(", ")}</p>
        </div>
        <AdminNav items={items} />
      </aside>
      <div className="min-w-0 p-4 sm:p-8">{children}</div>
    </div>
  );
}
