import { z } from "zod";

/**
 * Regulatory & commercial operating model.
 *
 * Every regulated capability defaults to OFF. A capability can only be switched to its
 * production mode when the authorisation evidence fields are filled in and recorded by a
 * user with settings:compliance. Code paths call `requireCapability()` before acting.
 */
export const complianceSchema = z.object({
  /** Licensed healthcare entity that provides the clinical service (per facility, see facilities table). */
  serviceProviderEntity: z.string().nullable().default(null),
  merchantOfRecord: z.string().nullable().default(null),
  stripeAccountOwnerEntity: z.string().nullable().default(null),
  recordsCustodian: z.string().nullable().default(null),
  dhaAdvertisingPermitRef: z.string().nullable().default(null),
  homeHealthcareAuthorizationRef: z.string().nullable().default(null),
  facilityContractPermitsExternalBooking: z.boolean().default(false),
  insuranceBilling: z.enum(["excluded", "supported"]).default("excluded"),

  /** disabled → booking requests only (pay at facility); test → Stripe test mode; live → real payments. */
  paymentsMode: z.enum(["disabled", "test", "live"]).default("disabled"),
  /** Whether the public site offers home visits. */
  homeVisitsMode: z.enum(["disabled", "waitlist", "enabled"]).default("disabled"),
  /**
   * disabled → no clinical data stored here.
   * document_reference → only references/IDs into the facility EMR plus patient-visible summaries.
   * native → structured records stored here (requires custodian + hosting approval).
   */
  emrMode: z.enum(["disabled", "document_reference", "native"]).default("disabled"),
  whatsappMode: z.enum(["disabled", "sandbox", "live"]).default("disabled"),
  /** Third-party ad pixels on public marketing pages (never on booking/portal/admin). */
  adPixelsEnabled: z.boolean().default(false),
  /** Server-side conversion APIs — default off for healthcare. Only aggregate, PHI-free events. */
  conversionApisEnabled: z.boolean().default(false),

  approvals: z
    .array(
      z.object({
        capability: z.string(),
        reference: z.string(),
        approvedBy: z.string(),
        recordedAt: z.string(),
      }),
    )
    .default([]),
});

export type Compliance = z.infer<typeof complianceSchema>;

export const DEFAULT_COMPLIANCE: Compliance = complianceSchema.parse({});

export type Capability = "payments_test" | "payments_live" | "home_visits" | "emr_reference" | "emr_native" | "whatsapp_live";

/** Returns a list of missing prerequisites for a capability (empty = allowed). */
export function capabilityBlockers(c: Compliance, cap: Capability): string[] {
  const missing: string[] = [];
  const need = (cond: unknown, msg: string) => {
    if (!cond) missing.push(msg);
  };
  switch (cap) {
    case "payments_test":
      need(c.paymentsMode === "test" || c.paymentsMode === "live", "paymentsMode is disabled");
      break;
    case "payments_live":
      need(c.paymentsMode === "live", "paymentsMode is not live");
      need(c.merchantOfRecord, "merchant of record not recorded");
      need(c.stripeAccountOwnerEntity, "Stripe account owner entity not recorded");
      need(c.stripeAccountOwnerEntity && c.stripeAccountOwnerEntity === c.merchantOfRecord, "Stripe account owner must be the merchant of record");
      need(c.serviceProviderEntity, "licensed service provider entity not recorded");
      need(c.facilityContractPermitsExternalBooking, "facility contract permission for external booking/payment not confirmed");
      break;
    case "home_visits":
      need(c.homeVisitsMode === "enabled", "homeVisitsMode is not enabled");
      need(c.homeHealthcareAuthorizationRef, "DHA home healthcare authorisation reference not recorded");
      break;
    case "emr_reference":
      need(c.emrMode !== "disabled", "emrMode is disabled");
      need(c.recordsCustodian, "medical records custodian not recorded");
      break;
    case "emr_native":
      need(c.emrMode === "native", "emrMode is not native");
      need(c.recordsCustodian, "medical records custodian not recorded");
      need(process.env.HEALTH_DATA_HOSTING_APPROVED === "true", "UAE health-data hosting approval flag not set");
      break;
    case "whatsapp_live":
      need(c.whatsappMode === "live", "whatsappMode is not live");
      break;
  }
  return missing;
}

export class CapabilityDisabledError extends Error {
  constructor(public cap: Capability, public blockers: string[]) {
    super(`Capability ${cap} is not authorised: ${blockers.join("; ")}`);
  }
}

export function requireCapability(c: Compliance, cap: Capability) {
  const blockers = capabilityBlockers(c, cap);
  if (blockers.length) throw new CapabilityDisabledError(cap, blockers);
}

/** Effective payment behaviour for checkout. */
export function paymentsEnabled(c: Compliance): "disabled" | "test" | "live" {
  if (capabilityBlockers(c, "payments_live").length === 0) return "live";
  if (c.paymentsMode === "test" && process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return "test";
  return "disabled";
}
