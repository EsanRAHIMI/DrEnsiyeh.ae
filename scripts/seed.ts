/**
 * Seeds a development/staging database.
 *
 * Everything not verified (facility, prices, zones) is inserted with isDemo=true and
 * status=pending_verification. The public site shows a "demonstration data" banner while
 * demo rows are active, and production refuses to serve them (see src/server/catalog.ts).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { DEFAULT_COMPLIANCE } from "../src/server/compliance";
import { randomUUID } from "node:crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema });
const s = schema;

async function main() {
  const existing = await db.select().from(s.providers).where(eq(s.providers.slug, "dr-ensiyeh-rahimi"));
  if (existing.length) {
    console.log("Already seeded");
    return;
  }

  const staff: { email: string; roles: (typeof s.roleEnum.enumValues)[number][]; name: string }[] = [];
  if (process.env.SEED_DOCTOR_EMAIL) staff.push({ email: process.env.SEED_DOCTOR_EMAIL, roles: ["doctor"], name: "Dr. Ensiyeh Rahimi" });
  if (process.env.SEED_ADMIN_EMAIL) staff.push({ email: process.env.SEED_ADMIN_EMAIL, roles: ["practice_admin", "tech_admin"], name: "Practice Administrator" });
  const userIds: Record<string, string> = {};
  for (const u of staff) {
    const [row] = await db.insert(s.users).values({ email: u.email.toLowerCase(), roles: u.roles, displayName: u.name }).returning();
    userIds[u.roles[0]] = row.id;
  }

  const [provider] = await db
    .insert(s.providers)
    .values({ slug: "dr-ensiyeh-rahimi", fullName: "Dr. Ensiyeh Rahimi", userId: userIds.doctor ?? null })
    .returning();

  const [clinic] = await db
    .insert(s.facilities)
    .values({
      slug: "demo-clinic-dubai",
      name: "Clinic location (to be confirmed)",
      status: "pending_verification",
      isDemo: true,
      addressLine: "Address pending verification",
      area: "Dubai",
      lat: 25.2048,
      lng: 55.2708,
      confirmationMode: "manual_staff",
      paymentMode: "prepay",
      captureMode: "on_confirmation",
      insuranceNote: "Insurance acceptance depends on the facility and your plan. Please confirm with the facility before your visit.",
      cancellationPolicy: { freeCancelHours: 24, lateCancelRefundPercent: 0 },
      openingHours: { note: "Pending confirmation" },
    })
    .returning();

  const svc = async (v: typeof s.services.$inferInsert) => (await db.insert(s.services).values(v).returning())[0];
  const consult = await svc({
    slug: "infectious-disease-consultation",
    kind: "clinic",
    name: { en: "Infectious disease consultation", ar: "استشارة الأمراض المعدية" },
    summary: {
      en: "An in-person specialist assessment for infections that are complex, recurrent, persistent or travel-related.",
    },
    preparation: {
      en: "Bring previous test results, imaging reports, a list of current medicines (including antibiotics taken recently) and your Emirates ID or passport.",
    },
    durationMinutes: 30,
    isDemo: true,
    sortOrder: 1,
  });
  const followUp = await svc({
    slug: "follow-up-consultation",
    kind: "clinic",
    name: { en: "Follow-up consultation", ar: "استشارة متابعة" },
    summary: { en: "Review of results and progress after a previous consultation." },
    preparation: { en: "Bring any new test results." },
    durationMinutes: 20,
    isDemo: true,
    sortOrder: 2,
  });
  const home = await svc({
    slug: "doctor-home-visit",
    kind: "home_visit",
    name: { en: "Doctor home visit", ar: "زيارة منزلية للطبيب" },
    summary: { en: "A scheduled, non-emergency specialist visit at your home within the approved service area." },
    preparation: { en: "Have previous reports and current medicines ready. Ensure building access for the doctor." },
    durationMinutes: 45,
    isDemo: true,
    sortOrder: 3,
  });

  // DEMO prices — replace from Admin → Pricing once confirmed by the facility / merchant of record.
  const off = async (serviceId: string, facilityId: string | null, priceMinor: number, extra: Partial<typeof s.offerings.$inferInsert> = {}) =>
    (await db.insert(s.offerings).values({ serviceId, facilityId, providerId: provider.id, priceMinor, ...extra }).returning())[0];
  await off(consult.id, clinic.id, 60000, { bufferAfterMinutes: 10 });
  await off(followUp.id, clinic.id, 40000, { bufferAfterMinutes: 10 });
  await off(home.id, null, 120000, { minNoticeMinutes: 240 });

  for (const weekday of [1, 2, 3, 4, 6]) {
    await db.insert(s.availabilityRules).values({ providerId: provider.id, facilityId: clinic.id, kind: "clinic", weekday, startTime: "09:00", endTime: "13:00", slotStepMinutes: 15 });
    await db.insert(s.availabilityRules).values({ providerId: provider.id, facilityId: clinic.id, kind: "clinic", weekday, startTime: "16:00", endTime: "20:00", slotStepMinutes: 15 });
  }
  for (const weekday of [0, 5]) {
    await db.insert(s.availabilityRules).values({ providerId: provider.id, facilityId: null, kind: "home_visit", weekday, startTime: "10:00", endTime: "18:00", slotStepMinutes: 30 });
  }

  await db.insert(s.homeVisitZones).values([
    { name: "Dubai Marina & JBR", centerLat: 25.0805, centerLng: 55.1403, radiusKm: 6, surchargeMinor: 0, travelBufferMinutes: 30, isDemo: true },
    { name: "Downtown & Business Bay", centerLat: 25.1972, centerLng: 55.2744, radiusKm: 6, surchargeMinor: 0, travelBufferMinutes: 30, isDemo: true },
    { name: "Jumeirah & Al Wasl", centerLat: 25.1865, centerLng: 55.2416, radiusKm: 6, surchargeMinor: 10000, travelBufferMinutes: 40, isDemo: true },
  ]);

  await db.insert(s.settings).values({ key: "compliance", value: { ...DEFAULT_COMPLIANCE, paymentsMode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "test" : "disabled" } });

  await db.insert(s.articleCategories).values([
    { slug: "infections", name: { en: "Infections" } },
    { slug: "travel-health", name: { en: "Travel health" } },
    { slug: "prevention", name: { en: "Prevention & vaccination" } },
  ]);

  await db.insert(s.articles).values({
    translationGroupId: randomUUID(),
    slug: "preparing-for-your-infectious-disease-consultation",
    title: "Preparing for your infectious disease consultation",
    excerpt: "What to bring and what to expect at your first appointment.",
    status: "draft",
    authorName: "Practice team",
    blocks: [
      { type: "paragraph", text: "DRAFT — requires medical review by Dr. Ensiyeh Rahimi before publication." },
      { type: "heading", level: 2, text: "What to bring" },
      { type: "list", items: ["Previous laboratory and imaging reports", "A list of all current medicines, including recent antibiotics", "Vaccination records, if available", "Your Emirates ID or passport"] },
    ],
    references: [],
  });

  console.log("Seed complete. Demo rows are flagged isDemo=true.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
