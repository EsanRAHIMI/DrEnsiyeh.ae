import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

/** Persistent dual CTA on small screens. Hidden inside the booking flow itself. */
export function MobileBookingBar({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/${locale}/book?kind=clinic`} className="btn-primary min-h-11 px-3 text-sm">
          {t.cta.bookClinic}
        </Link>
        <Link href={`/${locale}/book?kind=home_visit`} className="btn-secondary min-h-11 px-3 text-sm">
          {t.cta.bookHome}
        </Link>
      </div>
    </div>
  );
}
