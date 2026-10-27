import { localeFrom } from "@/i18n/server";
import { requirePatient } from "@/server/auth/session";
import { profileOf } from "@/server/portal";
import { SettingsForms } from "@/components/portal/SettingsForms";
import { db } from "@/db";
import { consents } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export default async function Settings({ params }: PageProps<"/[locale]/portal/settings">) {
  const { locale } = await localeFrom(params);
  const user = await requirePatient(locale);
  const { user: u, profiles } = await profileOf(user);
  const latest = async (purpose: "whatsapp_notifications" | "marketing_messages") =>
    (await db().select().from(consents).where(and(eq(consents.userId, user.userId), eq(consents.purpose, purpose))).orderBy(desc(consents.createdAt)).limit(1))[0]?.granted ?? false;
  return (
    <SettingsForms
      displayName={u.displayName ?? ""}
      phone={u.phone ?? ""}
      email={u.email ?? ""}
      locale={u.locale}
      whatsapp={await latest("whatsapp_notifications")}
      marketing={await latest("marketing_messages")}
      profiles={profiles.map((p) => ({ id: p.id, name: p.fullName, relationship: p.relationship, verified: !!p.identityVerifiedAt }))}
      deletionRequested={!!u.deletionRequestedAt}
    />
  );
}
