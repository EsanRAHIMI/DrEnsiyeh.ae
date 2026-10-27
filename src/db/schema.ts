import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  doublePrecision,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/*
 * Conventions
 * - All money is stored in minor units (fils for AED) as integers.
 * - All instants are timestamptz (UTC). Facility-local rendering uses the facility time zone.
 * - Clinical free text is stored encrypted (see lib/crypto.ts) and never logged.
 * - Rows that represent legal/financial/clinical facts are append-only or versioned.
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ─── Identity & access ────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", [
  "patient",
  "doctor",
  "practice_admin",
  "reception",
  "content_editor",
  "finance",
  "tech_admin",
]);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email"),
    emailVerifiedAt: ts("email_verified_at"),
    phone: text("phone"),
    phoneVerifiedAt: ts("phone_verified_at"),
    displayName: text("display_name"),
    locale: text("locale").notNull().default("en"),
    roles: roleEnum("roles").array().notNull().default(["patient"]),
    // TOTP secret (encrypted). Required for every non-patient role before staff access is granted.
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabledAt: ts("totp_enabled_at"),
    disabledAt: ts("disabled_at"),
    deletionRequestedAt: ts("deletion_requested_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_phone_idx").on(t.phone)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    // Staff sessions become "elevated" only after a successful TOTP check.
    mfaVerifiedAt: ts("mfa_verified_at"),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const loginChallenges = pgTable(
  "login_challenges",
  {
    id: id(),
    channel: text("channel", { enum: ["email", "sms", "whatsapp"] }).notNull(),
    destination: text("destination").notNull(),
    codeHash: text("code_hash").notNull(),
    linkTokenHash: text("link_token_hash"),
    purpose: text("purpose", { enum: ["login", "verify_contact"] }).notNull().default("login"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("login_challenges_dest_idx").on(t.destination), uniqueIndex("login_challenges_link_uq").on(t.linkTokenHash)],
);

// ─── Compliance / configuration ────────────────────────────────────────────────

/** Key/value configuration with versioning; e.g. key="compliance". */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    // Never put clinical content here — only identifiers and non-sensitive diffs.
    details: jsonb("details"),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_actor_idx").on(t.actorUserId)],
);

// ─── Practice catalogue ────────────────────────────────────────────────────────

export const providers = pgTable("providers", {
  id: id(),
  slug: text("slug").notNull().unique(),
  fullName: text("full_name").notNull(),
  userId: uuid("user_id").references(() => users.id),
  dhaLicenseNumber: text("dha_license_number"),
  dhaLicenseVerifiedAt: ts("dha_license_verified_at"),
  dhaLicenseExpiresAt: ts("dha_license_expires_at"),
  createdAt: createdAt(),
});

export const facilityStatusEnum = pgEnum("facility_status", ["pending_verification", "verified", "inactive"]);

export const facilities = pgTable("facilities", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // Licensed legal entity responsible for clinical encounters at this facility.
  legalEntityName: text("legal_entity_name"),
  dhaFacilityLicense: text("dha_facility_license"),
  status: facilityStatusEnum("status").notNull().default("pending_verification"),
  isDemo: boolean("is_demo").notNull().default(false),
  addressLine: text("address_line"),
  area: text("area"),
  emirate: text("emirate").notNull().default("Dubai"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  phone: text("phone"),
  timeZone: text("time_zone").notNull().default("Asia/Dubai"),
  openingHours: jsonb("opening_hours"),
  // How bookings at this facility become confirmed.
  confirmationMode: text("confirmation_mode", { enum: ["auto_on_payment", "manual_staff"] })
    .notNull()
    .default("manual_staff"),
  paymentMode: text("payment_mode", { enum: ["prepay", "pay_at_facility"] }).notNull().default("pay_at_facility"),
  captureMode: text("capture_mode", { enum: ["automatic", "on_confirmation"] }).notNull().default("on_confirmation"),
  insuranceNote: text("insurance_note"),
  // Contractual physician share of consultation fees at this facility (null = not configured).
  physicianSharePercent: integer("physician_share_percent"),
  cancellationPolicy: jsonb("cancellation_policy").notNull().default({ freeCancelHours: 24, lateCancelRefundPercent: 0 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const services = pgTable("services", {
  id: id(),
  slug: text("slug").notNull().unique(),
  kind: text("kind", { enum: ["clinic", "home_visit"] }).notNull(),
  // Localised name/summary { en: "...", ar: "..." }
  name: jsonb("name").notNull(),
  summary: jsonb("summary").notNull(),
  preparation: jsonb("preparation"),
  durationMinutes: integer("duration_minutes").notNull(),
  active: boolean("active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

/** A service as offered at a specific facility (clinic) — carries facility-specific pricing. */
export const offerings = pgTable(
  "offerings",
  {
    id: id(),
    serviceId: uuid("service_id").notNull().references(() => services.id),
    facilityId: uuid("facility_id").references(() => facilities.id),
    providerId: uuid("provider_id").notNull().references(() => providers.id),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull().default("AED"),
    durationMinutes: integer("duration_minutes"),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(120),
    maxAdvanceDays: integer("max_advance_days").notNull().default(60),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("offerings_uq").on(t.serviceId, t.facilityId, t.providerId)],
);

/** Weekly recurring availability. facilityId null + kind=home_visit means home-visit hours. */
export const availabilityRules = pgTable("availability_rules", {
  id: id(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  facilityId: uuid("facility_id").references(() => facilities.id),
  kind: text("kind", { enum: ["clinic", "home_visit"] }).notNull(),
  weekday: integer("weekday").notNull(), // 0=Sunday … 6=Saturday (facility local)
  startTime: text("start_time").notNull(), // "09:00" local
  endTime: text("end_time").notNull(), // "13:00" local
  slotStepMinutes: integer("slot_step_minutes").notNull().default(15),
  validFrom: ts("valid_from"),
  validUntil: ts("valid_until"),
});

/** One-off blocks (leave, conference) or extra openings. */
export const availabilityExceptions = pgTable("availability_exceptions", {
  id: id(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  facilityId: uuid("facility_id").references(() => facilities.id),
  type: text("type", { enum: ["block", "open"] }).notNull(),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => users.id),
});

/** Busy intervals mirrored from external calendars (Google). Content-free. */
export const externalBusy = pgTable(
  "external_busy",
  {
    id: id(),
    providerId: uuid("provider_id").notNull().references(() => providers.id),
    source: text("source").notNull(),
    externalId: text("external_id"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    syncedAt: ts("synced_at").notNull().defaultNow(),
  },
  (t) => [index("external_busy_provider_idx").on(t.providerId, t.startsAt)],
);

export const homeVisitZones = pgTable("home_visit_zones", {
  id: id(),
  name: text("name").notNull(),
  emirate: text("emirate").notNull().default("Dubai"),
  centerLat: doublePrecision("center_lat").notNull(),
  centerLng: doublePrecision("center_lng").notNull(),
  radiusKm: doublePrecision("radius_km").notNull(),
  surchargeMinor: integer("surcharge_minor").notNull().default(0),
  travelBufferMinutes: integer("travel_buffer_minutes").notNull().default(30),
  active: boolean("active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
});

// ─── Patients ──────────────────────────────────────────────────────────────────

export const patients = pgTable(
  "patients",
  {
    id: id(),
    // Account that may act for this patient (self or verified guardian).
    accountUserId: uuid("account_user_id").references(() => users.id),
    relationship: text("relationship", { enum: ["self", "child", "dependent"] }).notNull().default("self"),
    guardianVerifiedAt: ts("guardian_verified_at"),
    fullName: text("full_name").notNull(),
    dateOfBirth: text("date_of_birth"),
    email: text("email"),
    phone: text("phone"),
    // Set by staff after in-person ID check. Required before clinical records are visible in the portal.
    identityVerifiedAt: ts("identity_verified_at"),
    identityVerifiedBy: uuid("identity_verified_by").references(() => users.id),
    // Medical Record Number at the responsible licensed facility, if records live there.
    externalMrn: text("external_mrn"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("patients_account_idx").on(t.accountUserId), index("patients_email_idx").on(t.email)],
);

// ─── Bookings ──────────────────────────────────────────────────────────────────

export const bookingStatusEnum = pgEnum("booking_status", [
  "hold", // slot reserved while patient completes details / payment
  "pending_payment", // checkout session open
  "requested", // pay-at-facility request awaiting facility confirmation
  "awaiting_confirmation", // paid/authorised, awaiting facility confirmation
  "confirmed",
  "completed",
  "cancelled",
  "expired",
  "no_show",
]);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    reference: text("reference").notNull().unique(), // human reference e.g. "DR-7K3M9Q"
    status: bookingStatusEnum("status").notNull().default("hold"),
    kind: text("kind", { enum: ["clinic", "home_visit"] }).notNull(),
    offeringId: uuid("offering_id").notNull().references(() => offerings.id),
    providerId: uuid("provider_id").notNull().references(() => providers.id),
    facilityId: uuid("facility_id").references(() => facilities.id),
    patientId: uuid("patient_id").references(() => patients.id),
    accountUserId: uuid("account_user_id").references(() => users.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    // Occupied interval including buffers / travel. Protected by an exclusion constraint (see migrations).
    blockStartsAt: ts("block_starts_at").notNull(),
    blockEndsAt: ts("block_ends_at").notNull(),
    holdExpiresAt: ts("hold_expires_at"),
    // Contact details captured at booking (unverified until OTP/payment). Not sent to ad platforms.
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    // Home visit
    homeZoneId: uuid("home_zone_id").references(() => homeVisitZones.id),
    homeAddressEnc: text("home_address_enc"),
    homeLat: doublePrecision("home_lat"),
    homeLng: doublePrecision("home_lng"),
    // Pricing snapshot
    basePriceMinor: integer("base_price_minor").notNull(),
    surchargeMinor: integer("surcharge_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull().default("AED"),
    paymentMode: text("payment_mode", { enum: ["prepay", "pay_at_facility"] }).notNull(),
    attributionId: uuid("attribution_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    rescheduledFromId: uuid("rescheduled_from_id"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    confirmedAt: ts("confirmed_at"),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    completedAt: ts("completed_at"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("bookings_idempotency_uq").on(t.idempotencyKey),
    index("bookings_provider_time_idx").on(t.providerId, t.startsAt),
    index("bookings_account_idx").on(t.accountUserId),
    index("bookings_status_idx").on(t.status),
  ],
);

export const bookingEvents = pgTable(
  "booking_events",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorType: text("actor_type", { enum: ["patient", "staff", "system", "stripe"] }).notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId)],
);

// ─── Payments ──────────────────────────────────────────────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    provider: text("provider").notNull().default("stripe"),
    livemode: boolean("livemode").notNull().default(false),
    checkoutSessionId: text("checkout_session_id"),
    paymentIntentId: text("payment_intent_id"),
    status: text("status", {
      enum: ["open", "authorized", "succeeded", "failed", "cancelled", "expired", "refunded", "partially_refunded"],
    })
      .notNull()
      .default("open"),
    amountMinor: integer("amount_minor").notNull(),
    amountRefundedMinor: integer("amount_refunded_minor").notNull().default(0),
    feeMinor: integer("fee_minor"),
    currency: text("currency").notNull().default("AED"),
    merchantOfRecord: text("merchant_of_record").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("payments_checkout_uq").on(t.checkoutSessionId), index("payments_booking_idx").on(t.bookingId)],
);

export const refunds = pgTable("refunds", {
  id: id(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  stripeRefundId: text("stripe_refund_id").unique(),
  amountMinor: integer("amount_minor").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  requestedBy: uuid("requested_by").references(() => users.id),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: createdAt(),
});

export const invoices = pgTable("invoices", {
  id: id(),
  number: text("number").notNull().unique(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  issuerLegalEntity: text("issuer_legal_entity").notNull(),
  issuerTrn: text("issuer_trn"),
  billToName: text("bill_to_name").notNull(),
  lines: jsonb("lines").notNull(),
  subtotalMinor: integer("subtotal_minor").notNull(),
  vatMinor: integer("vat_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull(),
  currency: text("currency").notNull().default("AED"),
  issuedAt: ts("issued_at").notNull().defaultNow(),
});

/** Every Stripe webhook event id we have processed (idempotency). */
export const processedWebhooks = pgTable("processed_webhooks", {
  eventId: text("event_id").primaryKey(),
  source: text("source").notNull(),
  type: text("type").notNull(),
  processedAt: ts("processed_at").notNull().defaultNow(),
});

// ─── Clinical records (gated by compliance.emrMode) ─────────────────────────────

export const clinicalNotes = pgTable(
  "clinical_notes",
  {
    id: id(),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    type: text("type", {
      enum: ["history", "allergy", "medication", "visit_note", "treatment_plan", "follow_up", "visit_summary"],
    }).notNull(),
    // Encrypted JSON body. FHIR-shaped where applicable.
    bodyEnc: text("body_enc").notNull(),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    // Whether the patient may see this in the portal (visit summaries / follow-up instructions).
    patientVisible: boolean("patient_visible").notNull().default(false),
    signedAt: ts("signed_at"),
    // Amendments create a new row pointing at the superseded row; signed rows are never updated.
    supersedesId: uuid("supersedes_id"),
    amendmentReason: text("amendment_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("clinical_notes_patient_idx").on(t.patientId)],
);

export const documents = pgTable("documents", {
  id: id(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  bookingId: uuid("booking_id").references(() => bookings.id),
  category: text("category", { enum: ["lab_report", "diagnostic_report", "referral", "invoice", "other"] }).notNull(),
  title: text("title").notNull(),
  storageKey: text("storage_key"), // object storage key (native mode)
  externalReference: text("external_reference"), // document reference in facility EMR (reference mode)
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  sha256: text("sha256"),
  patientVisible: boolean("patient_visible").notNull().default(false),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: createdAt(),
});

export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id),
    anonymousId: text("anonymous_id"),
    purpose: text("purpose", {
      enum: ["terms", "privacy", "booking_policy", "analytics", "marketing_ads", "whatsapp_notifications", "marketing_messages", "data_processing_clinical"],
    }).notNull(),
    granted: boolean("granted").notNull(),
    documentVersion: text("document_version").notNull(),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("consents_user_idx").on(t.userId, t.purpose)],
);

export const dataRequests = pgTable("data_requests", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: text("type", { enum: ["access", "deletion", "correction"] }).notNull(),
  status: text("status", { enum: ["open", "in_progress", "completed", "rejected"] }).notNull().default("open"),
  notes: text("notes"),
  createdAt: createdAt(),
  resolvedAt: ts("resolved_at"),
});

export const messages = pgTable("messages", {
  id: id(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  senderUserId: uuid("sender_user_id").notNull().references(() => users.id),
  bodyEnc: text("body_enc").notNull(),
  readAt: ts("read_at"),
  createdAt: createdAt(),
});

// ─── Notifications outbox ─────────────────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    dedupeKey: text("dedupe_key").notNull(),
    channel: text("channel", { enum: ["email", "whatsapp", "sms", "in_app"] }).notNull(),
    template: text("template").notNull(),
    recipientUserId: uuid("recipient_user_id").references(() => users.id),
    recipientAddress: text("recipient_address"),
    // Template variables. Must contain only privacy-safe values (reference, time, location name).
    params: jsonb("params").notNull(),
    status: text("status", { enum: ["queued", "sending", "sent", "delivered", "failed", "suppressed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    notBefore: ts("not_before").notNull().defaultNow(),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("notifications_dedupe_uq").on(t.dedupeKey), index("notifications_status_idx").on(t.status, t.notBefore)],
);

// ─── Calendar integration ─────────────────────────────────────────────────────

export const calendarConnections = pgTable("calendar_connections", {
  id: id(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  googleAccountEmail: text("google_account_email"),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  writeCalendarId: text("write_calendar_id").notNull().default("primary"),
  busyCalendarIds: text("busy_calendar_ids").array().notNull().default(["primary"]),
  status: text("status", { enum: ["active", "error", "revoked"] }).notNull().default("active"),
  lastSyncAt: ts("last_sync_at"),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

export const calendarEventLinks = pgTable("calendar_event_links", {
  bookingId: uuid("booking_id").primaryKey().references(() => bookings.id),
  connectionId: uuid("connection_id").notNull().references(() => calendarConnections.id),
  googleEventId: text("google_event_id"),
  syncedVersion: integer("synced_version").notNull().default(0),
  desiredVersion: integer("desired_version").notNull().default(1),
  lastError: text("last_error"),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: updatedAt(),
});

// ─── CMS ──────────────────────────────────────────────────────────────────────

export const articleStatusEnum = pgEnum("article_status", [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "unpublished",
]);

export const articleCategories = pgTable("article_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: jsonb("name").notNull(),
});

export const articles = pgTable(
  "articles",
  {
    id: id(),
    translationGroupId: uuid("translation_group_id").notNull(),
    locale: text("locale").notNull().default("en"),
    slug: text("slug").notNull(),
    status: articleStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    blocks: jsonb("blocks").notNull().default([]),
    references: jsonb("references").notNull().default([]),
    categoryId: uuid("category_id").references(() => articleCategories.id),
    tags: text("tags").array().notNull().default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    canonicalUrl: text("canonical_url"),
    heroImageUrl: text("hero_image_url"),
    heroImageAlt: text("hero_image_alt"),
    authorUserId: uuid("author_user_id").references(() => users.id),
    authorName: text("author_name").notNull(),
    medicalReviewerUserId: uuid("medical_reviewer_user_id").references(() => users.id),
    medicalReviewerName: text("medical_reviewer_name"),
    medicallyReviewedAt: ts("medically_reviewed_at"),
    reviewDueAt: ts("review_due_at"),
    scheduledFor: ts("scheduled_for"),
    publishedAt: ts("published_at"),
    approvedRevision: integer("approved_revision"),
    revision: integer("revision").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("articles_locale_slug_uq").on(t.locale, t.slug), index("articles_status_idx").on(t.status)],
);

export const articleRevisions = pgTable(
  "article_revisions",
  {
    articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    editorUserId: uuid("editor_user_id").references(() => users.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.revision] })],
);

export const redirects = pgTable("redirects", {
  id: id(),
  fromPath: text("from_path").notNull().unique(),
  toPath: text("to_path").notNull(),
  permanent: boolean("permanent").notNull().default(true),
  createdAt: createdAt(),
});

export const seoIssues = pgTable(
  "seo_issues",
  {
    id: id(),
    url: text("url").notNull(),
    type: text("type").notNull(),
    severity: text("severity", { enum: ["info", "warning", "error"] }).notNull(),
    detail: text("detail"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [uniqueIndex("seo_issues_uq").on(t.url, t.type)],
);

export const editorialTasks = pgTable("editorial_tasks", {
  id: id(),
  articleId: uuid("article_id").references(() => articles.id),
  type: text("type", { enum: ["medical_review_due", "content_brief", "metadata_fix", "internal_link"] }).notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  status: text("status", { enum: ["open", "done", "dismissed"] }).notNull().default("open"),
  dueAt: ts("due_at"),
  createdAt: createdAt(),
});

// ─── Marketing attribution (first-party, consent-gated, no PHI) ─────────────────

export const attributions = pgTable("attributions", {
  id: id(),
  anonymousId: text("anonymous_id").notNull(),
  source: text("source"),
  medium: text("medium"),
  campaign: text("campaign"),
  content: text("content"),
  term: text("term"),
  clickPlatform: text("click_platform"), // gclid/fbclid/... presence only — the id itself is not stored
  landingPath: text("landing_path"),
  experimentVariant: text("experiment_variant"),
  createdAt: createdAt(),
});

export const funnelEvents = pgTable(
  "funnel_events",
  {
    id: id(),
    anonymousId: text("anonymous_id"),
    attributionId: uuid("attribution_id").references(() => attributions.id),
    step: text("step", {
      enum: ["page_view", "booking_start", "slot_selected", "details_submitted", "checkout_started", "booking_completed"],
    }).notNull(),
    path: text("path"),
    // Coarse booking kind (clinic|home_visit) — never the medical service.
    kind: text("kind"),
    createdAt: createdAt(),
  },
  (t) => [index("funnel_events_step_idx").on(t.step, t.createdAt)],
);

export const adSpend = pgTable(
  "ad_spend",
  {
    id: id(),
    platform: text("platform", { enum: ["google", "meta", "linkedin", "tiktok", "snapchat"] }).notNull(),
    campaign: text("campaign").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    spendMinor: integer("spend_minor").notNull(),
    currency: text("currency").notNull().default("AED"),
    impressions: integer("impressions"),
    clicks: integer("clicks"),
  },
  (t) => [uniqueIndex("ad_spend_uq").on(t.platform, t.campaign, t.date)],
);

export const searchMetrics = pgTable(
  "search_metrics",
  {
    id: id(),
    date: text("date").notNull(),
    page: text("page").notNull(),
    query: text("query").notNull().default(""),
    impressions: integer("impressions").notNull(),
    clicks: integer("clicks").notNull(),
    position: doublePrecision("position"),
  },
  (t) => [uniqueIndex("search_metrics_uq").on(t.date, t.page, t.query)],
);

export const webVitals = pgTable("web_vitals", {
  id: id(),
  path: text("path").notNull(),
  name: text("name").notNull(),
  value: doublePrecision("value").notNull(),
  rating: text("rating"),
  createdAt: createdAt(),
});
