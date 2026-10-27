import type { Metadata } from "next";
import { localeFrom } from "@/i18n/server";
import { BookingStatusPoller } from "@/components/booking/BookingStatusPoller";

export const metadata: Metadata = { title: "Booking status", robots: { index: false, follow: false } };

export default async function BookingStatus({ params, searchParams }: PageProps<"/[locale]/book/status/[id]">) {
  const { locale } = await localeFrom(params);
  const { id } = await params;
  const sp = await searchParams;
  return (
    <div className="container-page max-w-2xl py-14">
      <BookingStatusPoller locale={locale} bookingId={id} token={typeof sp.t === "string" ? sp.t : ""} cancelled={sp.cancelled === "1"} />
    </div>
  );
}
