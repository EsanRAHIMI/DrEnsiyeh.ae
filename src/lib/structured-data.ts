import { PROFILE, SAME_AS } from "@/content/profile";
import { baseUrl } from "./site";

type Facility = { name: string; addressLine: string | null; area: string | null; emirate: string; lat: number | null; lng: number | null; phone: string | null; slug: string; status: string; isDemo: boolean };

/** Physician entity. Only verified, visible facts. Facilities included only when verified. */
export function physicianJsonLd(facilities: Facility[] = []) {
  const verified = facilities.filter((f) => f.status === "verified" && !f.isDemo);
  return {
    "@context": "https://schema.org",
    "@type": "Physician",
    "@id": `${baseUrl()}/#physician`,
    name: PROFILE.name.value,
    url: baseUrl(),
    medicalSpecialty: "https://schema.org/Infectious",
    knowsLanguage: ["en", "fa"],
    sameAs: SAME_AS,
    description: "Infectious diseases specialist in Dubai offering in-clinic consultations.",
    areaServed: { "@type": "City", name: "Dubai" },
    ...(verified.length
      ? {
          hospitalAffiliation: verified.map((f) => ({
            "@type": "MedicalClinic",
            name: f.name,
            url: `${baseUrl()}/en/locations#${f.slug}`,
            address: { "@type": "PostalAddress", streetAddress: f.addressLine, addressLocality: f.area ?? "Dubai", addressRegion: f.emirate, addressCountry: "AE" },
            ...(f.lat && f.lng ? { geo: { "@type": "GeoCoordinates", latitude: f.lat, longitude: f.lng } } : {}),
            ...(f.phone ? { telephone: f.phone } : {}),
          })),
        }
      : {}),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${baseUrl()}/#website`,
    url: baseUrl(),
    name: "Dr. Ensiyeh Rahimi",
    about: { "@id": `${baseUrl()}/#physician` },
  };
}
