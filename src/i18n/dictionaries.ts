import type { Locale } from "./config";

const en = {
  brand: "Dr. Ensiyeh Rahimi",
  brandSub: "Infectious Diseases Specialist · Dubai",
  nav: {
    about: "About",
    services: "Services",
    clinic: "Clinic visit",
    home: "Home visit",
    locations: "Locations",
    articles: "Articles",
    patientInfo: "Patient information",
    faq: "FAQ",
    contact: "Contact",
    login: "Patient login",
    portal: "My account",
  },
  cta: { bookClinic: "Book Clinic Visit", bookHome: "Book Home Visit", book: "Book appointment", viewTimes: "See available times" },
  emergency: {
    title: "Not for emergencies",
    body: "If you have severe symptoms — difficulty breathing, chest pain, confusion, a stiff neck with fever, a rapidly spreading rash, or you feel very unwell — call 998 (ambulance) or go to the nearest emergency department now. Online booking and home visits are not an emergency service.",
  },
  demoBanner: "Staging preview — locations, prices and schedules shown are placeholders pending verification. Bookings are not real.",
  footer: {
    disclaimer: "Information on this website is general and does not replace an individual medical consultation.",
    legal: "Legal",
    rights: "All rights reserved.",
  },
  booking: {
    title: "Book an appointment",
    stepKind: "Visit type",
    stepService: "Service",
    stepLocation: "Location",
    stepTime: "Date & time",
    stepDetails: "Your details",
    stepReview: "Review & pay",
    clinic: "In-clinic consultation",
    clinicDesc: "Visit the doctor at an approved clinic.",
    home: "Doctor home visit",
    homeDesc: "A scheduled, non-emergency visit at your home within the service area.",
    homeUnavailable: "Home visits will open once all authorisations are in place.",
    noSlots: "No times available on this day. Try another date.",
    holdNotice: "We are holding this time for you for 10 minutes.",
    fullName: "Full name (as on ID)",
    email: "Email",
    phone: "Mobile number",
    forSomeoneElse: "I am booking for someone else",
    acceptPolicy: "I have read the cancellation & refund policy and the medical disclaimer.",
    payNow: "Continue to secure payment",
    request: "Send booking request",
    total: "Total",
    duration: "Duration",
    minutes: "min",
    priceNote: "Price confirmed at checkout. Insurance claims are handled by the facility where applicable.",
    notConfirmedYet: "Your booking is not confirmed until you receive a confirmation message.",
  },
};

export type Dictionary = typeof en;

// Arabic: draft machine-assisted strings — MUST be reviewed by a qualified translator before indexing.
const ar: Dictionary = {
  brand: "د. إنسية رحيمي",
  brandSub: "أخصائية الأمراض المعدية · دبي",
  nav: {
    about: "نبذة",
    services: "الخدمات",
    clinic: "زيارة العيادة",
    home: "زيارة منزلية",
    locations: "المواقع",
    articles: "مقالات",
    patientInfo: "معلومات المرضى",
    faq: "الأسئلة الشائعة",
    contact: "تواصل معنا",
    login: "دخول المرضى",
    portal: "حسابي",
  },
  cta: { bookClinic: "احجز زيارة العيادة", bookHome: "احجز زيارة منزلية", book: "احجز موعداً", viewTimes: "عرض المواعيد المتاحة" },
  emergency: {
    title: "ليست خدمة طوارئ",
    body: "إذا كانت لديك أعراض شديدة مثل صعوبة التنفس أو ألم الصدر أو التشوش أو تيبس الرقبة مع الحمى أو طفح جلدي ينتشر بسرعة، اتصل بالرقم 998 أو توجه إلى أقرب قسم طوارئ فوراً.",
  },
  demoBanner: "معاينة تجريبية — المواقع والأسعار والمواعيد المعروضة غير نهائية.",
  footer: { disclaimer: "المعلومات الواردة في هذا الموقع عامة ولا تغني عن الاستشارة الطبية الفردية.", legal: "قانوني", rights: "جميع الحقوق محفوظة." },
  booking: {
    title: "احجز موعداً",
    stepKind: "نوع الزيارة",
    stepService: "الخدمة",
    stepLocation: "الموقع",
    stepTime: "التاريخ والوقت",
    stepDetails: "بياناتك",
    stepReview: "المراجعة والدفع",
    clinic: "استشارة في العيادة",
    clinicDesc: "زيارة الطبيبة في عيادة معتمدة.",
    home: "زيارة منزلية",
    homeDesc: "زيارة مجدولة غير طارئة في منزلك ضمن نطاق الخدمة.",
    homeUnavailable: "ستتوفر الزيارات المنزلية بعد استكمال التراخيص.",
    noSlots: "لا توجد مواعيد متاحة في هذا اليوم.",
    holdNotice: "نحتفظ بهذا الموعد لك لمدة 10 دقائق.",
    fullName: "الاسم الكامل",
    email: "البريد الإلكتروني",
    phone: "رقم الجوال",
    forSomeoneElse: "أحجز لشخص آخر",
    acceptPolicy: "قرأت سياسة الإلغاء والاسترداد وإخلاء المسؤولية الطبية.",
    payNow: "المتابعة إلى الدفع الآمن",
    request: "إرسال طلب الحجز",
    total: "الإجمالي",
    duration: "المدة",
    minutes: "دقيقة",
    priceNote: "يتم تأكيد السعر عند الدفع.",
    notConfirmedYet: "لا يعتبر حجزك مؤكداً حتى تصلك رسالة التأكيد.",
  },
};

const DICTS: Record<Locale, Dictionary> = { en, ar };
export const getDictionary = (locale: Locale) => DICTS[locale];

export function pickLocalized(value: unknown, locale: Locale): string {
  const v = value as Record<string, string> | null;
  return v?.[locale] ?? v?.en ?? "";
}
