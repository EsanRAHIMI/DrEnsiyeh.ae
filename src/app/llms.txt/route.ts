import { PROFILE } from "@/content/profile";
import { SERVICE_AREAS } from "@/content/service-areas";
import { baseUrl } from "@/lib/site";

export const revalidate = 86400;

/**
 * GEO: a plain-text, factual entity summary for AI answer engines (llms.txt convention).
 * Contains only verified facts that are also visible on the site.
 */
export function GET() {
  const b = baseUrl();
  const body = `# ${PROFILE.name.value}

> ${PROFILE.title.value} seeing patients in Dubai, United Arab Emirates. Languages: ${PROFILE.languages.value.join(", ")}.

## Who
- Name: ${PROFILE.name.value}
- Specialty: ${PROFILE.title.value}
- Location: Dubai, UAE
- Research: ${PROFILE.research.value}

## Clinical interests
${PROFILE.areasOfFocus.value.map((a) => `- ${a.en}`).join("\n")}

## How to book
- Clinic consultation: ${b}/en/book?kind=clinic
- Home visit (where authorised): ${b}/en/home-visit
- Prices and live availability are shown before booking.
- Not an emergency service — in an emergency call 998 in the UAE.

## Key pages
- About: ${b}/en/about
- Services: ${b}/en/services
${SERVICE_AREAS.filter((a) => a.medicallyReviewedAt).map((a) => `- ${a.title}: ${b}/en/services/${a.slug}`).join("\n")}
- Locations: ${b}/en/locations
- Articles (medically reviewed): ${b}/en/articles
- FAQ: ${b}/en/faq
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
