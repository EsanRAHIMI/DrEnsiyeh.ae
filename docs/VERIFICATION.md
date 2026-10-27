# Source verification & directory correction checklist

Research performed 27 Oct 2026. Sources were treated as research only — **no text or images were
copied**, and nothing unverified is published.

## What each source showed

| Source | Result |
|---|---|
| https://drensiyeh.ae | **Domain does not resolve (DNS ENOTFOUND).** No live site to migrate. |
| https://drensiyeh.ir | Title only: "Dr. Ensiyeh Rahimi, MD - Infectious Disease Specialist". No further content retrievable. |
| Saudi German Hospital profile | **HTTP 403** to automated access — must be checked manually. |
| Zulekha Hospitals profile | "Specialist – Infectious Diseases"; languages English & Persian; "over 10 years of clinical experience"; research collaboration with the Research Center for HIV/AIDS, Tehran University of Medical Sciences; list of clinical interests (used for the areas-of-focus list). No facility assignment, no DHA licence number, no degrees listed. |
| LinkedIn (via search summary) | Infectious diseases specialist in Dubai; "more than eight years" of experience; publications (culture-negative endocarditis, COVID-19 estimation, SARS-CoV-2 viral load, RSV/hMPV in children). Self-reported. |
| Instagram | Not accessed (login wall). Professional photos may exist there — **usage rights required** before use. |
| DHA public directory (search) | No profile found for her in search results — must be checked directly in DHA Sheryan / Dubai Health directory. |

## Inconsistencies found

1. **Years of experience**: ">10 years" (Zulekha) vs ">8 years" (LinkedIn). → Not displayed anywhere until the doctor confirms.
2. **Specialty wording**: "Specialist – Infectious Diseases" (Zulekha) vs "Infectious & Tropical Diseases" (brief) vs "MD - Infectious Disease Specialist" (.ir). → Site uses the DHA-style title "Specialist — Infectious Diseases" until the DHA licence wording is confirmed.
3. **Current affiliations**: two hospital groups list her; which one(s) are current and where she holds privileges is unknown. → No facility is shown as verified; the seeded clinic is a labelled placeholder.
4. **Primary domain** drensiyeh.ae is not live; .ir site still advertises.

## Information needed from Dr. Rahimi / practice (blocks publication of the item)

- [ ] DHA licence number, title exactly as on licence, expiry date (Sheryan screenshot or certificate)
- [ ] Degrees, specialist training, board certifications — with institutions and years (copies of certificates)
- [ ] Confirmed years of experience (single figure for all listings)
- [ ] Current facilities with privileges; for each: legal entity, DHA facility licence, address, phone, clinic hours, confirmation process, cancellation policy, prices, insurance acceptance, physician fee share (for internal reporting)
- [ ] Home-visit authorisation (which licensed home-healthcare provider, service area)
- [ ] Professional photographs **with written usage rights** (photographer licence / facility consent)
- [ ] Approved Arabic and Persian transliterations of the name (إنسية رحيمي — draft; Persian انسیه رحیمی — draft)
- [ ] Confirmation of the areas of focus list (currently from the Zulekha profile) and medical review of the six service pages in `src/content/service-areas.ts`
- [ ] Contact email / WhatsApp Business number for the practice

## Directory & listing correction checklist

| Listing | Action |
|---|---|
| Zulekha Hospitals profile | Align experience figure; add booking link to drensiyeh.ae once facility agrees; confirm facility location shown |
| Saudi German Hospital profile | Verify current status manually (403 to bots); request removal if no longer affiliated, or update |
| LinkedIn | Align title with DHA wording, experience figure, add drensiyeh.ae |
| drensiyeh.ir | Add notice/link for UAE patients to drensiyeh.ae (or canonical cross-reference) |
| Instagram bio | Link to drensiyeh.ae; follow DHA advertising rules on medical claims |
| Google Business Profile | Create **only** if eligible (a practitioner profile at a facility where she practises, per Google guidelines); never at facilities without privileges |
| DHA Dubai Health directory | Confirm listing details match website |
| Bing Places / Apple Business Connect | Mirror the verified Google Business Profile data |

## Transliterations used in the code (DRAFT — require review)

- Arabic UI dictionary: `د. إنسية رحيمي` — Arabic locale is served `noindex` and excluded from the
  sitemap/hreflang until `LOCALE_META.ar.reviewed = true` in `src/i18n/config.ts`.
