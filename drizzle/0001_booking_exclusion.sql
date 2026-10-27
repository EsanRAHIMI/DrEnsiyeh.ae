-- Double-booking prevention at the database level.
-- A provider can never have two active bookings whose occupied intervals (incl. buffers/travel) overlap,
-- regardless of facility. Application code relies on this as the final arbiter under concurrency.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "provider_id" WITH =,
    tstzrange("block_starts_at", "block_ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('hold', 'pending_payment', 'requested', 'awaiting_confirmation', 'confirmed'));
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_order" CHECK ("ends_at" > "starts_at" AND "block_ends_at" >= "ends_at" AND "block_starts_at" <= "starts_at");
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_le_amount" CHECK ("amount_refunded_minor" <= "amount_minor");
--> statement-breakpoint
-- Signed clinical notes are immutable: block UPDATE once signed_at is set.
CREATE OR REPLACE FUNCTION clinical_notes_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'signed clinical notes are immutable; create an amendment instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER clinical_notes_no_update_after_sign BEFORE UPDATE OR DELETE ON "clinical_notes"
  FOR EACH ROW EXECUTE FUNCTION clinical_notes_immutable();
--> statement-breakpoint
-- Audit log is append-only.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_mutation BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
