/**
 * Doctor profile — ONLY facts verified against a cited public source.
 * Every field carries its source; anything unverified stays null and is not rendered.
 * See docs/VERIFICATION.md for the open verification checklist.
 */
export type Sourced<T> = { value: T; sources: string[]; verified: boolean };

const ZULEKHA = "https://www.zulekhahospitals.com/index.php/dubai/infectious-diseases%20/dr-ensiyeh-rahimi";
const LINKEDIN = "https://ae.linkedin.com/in/drensiyeh";
const IR_SITE = "https://drensiyeh.ir";

export const PROFILE = {
  name: { value: "Dr. Ensiyeh Rahimi", sources: [ZULEKHA, LINKEDIN, IR_SITE], verified: true },
  title: { value: "Specialist — Infectious Diseases", sources: [ZULEKHA], verified: true },
  specialty: { value: "Infectious & Tropical Diseases", sources: [ZULEKHA, IR_SITE], verified: false },
  languages: { value: ["English", "Persian (Farsi)"], sources: [ZULEKHA], verified: true },
  /** Conflicting public statements (">10 years" vs ">8 years") — not rendered until confirmed by the doctor. */
  yearsOfExperience: { value: null as number | null, sources: [ZULEKHA, LINKEDIN], verified: false },
  dhaLicense: { value: null as string | null, sources: [], verified: false },
  qualifications: { value: [] as string[], sources: [], verified: false },
  research: {
    value: "Research collaboration with the Research Center for HIV/AIDS, Tehran University of Medical Sciences",
    sources: [ZULEKHA],
    verified: true,
  },
  /** Areas of clinical interest as listed on the hospital profile. Publish only after the doctor confirms current scope. */
  areasOfFocus: {
    value: [
      { key: "respiratory", en: "Respiratory infections, including influenza, COVID-19, pneumonia and sinusitis" },
      { key: "skin", en: "Skin and soft-tissue infections, including diabetic foot infections" },
      { key: "sti", en: "Sexually transmitted infections, HIV testing and management" },
      { key: "uti", en: "Urinary tract infections, including recurrent UTIs" },
      { key: "tb", en: "Tuberculosis" },
      { key: "hepatitis", en: "Viral hepatitis" },
      { key: "fungal", en: "Fungal infections" },
      { key: "fuo", en: "Persistent or unexplained fever (fever of unknown origin)" },
      { key: "travel", en: "Travel medicine and adult vaccination" },
      { key: "stewardship", en: "Antimicrobial stewardship and infection prevention" },
    ],
    sources: [ZULEKHA],
    verified: true,
  },
} as const;

export const SAME_AS = [LINKEDIN, "https://www.instagram.com/drensiyeh/"];
