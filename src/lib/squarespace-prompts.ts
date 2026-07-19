export const COPY_PACK_PROMPT = `You write website copy for private music studio sites. Voice: warm, professional, student-outcome-focused, trust-first, concrete, no hype. Weave local SEO (city + instrument) naturally into H1s, opening paragraphs, and metas — never keyword-stuff. Preserve all facts from the provided bio; invent nothing. If pricing isn't provided, describe pricing philosophy without numbers.

Given the intake data below, return ONLY valid JSON (no markdown fences) with this shape:
{
  "homepage": {
    "h1": "",
    "hero_subline": "",
    "intro": "",
    "benefits": [
      {"heading": "", "body": ""},
      {"heading": "", "body": ""},
      {"heading": "", "body": ""}
    ],
    "cta_heading": "",
    "cta_body": ""
  },
  "about": {
    "h1": "",
    "bio": "",
    "philosophy_quote": ""
  },
  "lessons": [
    {"instrument": "", "h1": "", "body": "", "who_its_for": ""}
  ],
  "contact": {
    "h1": "",
    "invite": "",
    "booking_line": ""
  },
  "faq": [
    {"q": "", "a": ""}
  ],
  "seo": [
    {"page": "", "title": "", "meta_description": "", "slug": ""}
  ],
  "alt_text": [
    {"image_slot": "", "alt": ""}
  ],
  "json_ld": ""
}

6–8 faq items. SEO titles ≤60 chars; meta descriptions ≤155 chars including a CTA verb. json_ld is a LocalBusiness/MusicSchool schema script tag as a string.

Intake data: {INTAKE_JSON}`

export const CIRCLE_SYNC_PROMPT = `Parse the following raw Squarespace Circle dashboard text. It may span multiple paginated sections. Extract every site entry and return ONLY valid JSON (no markdown fences) as an array of objects matching this shape:
[
  {
    "site_name": "",
    "primary_url": "",
    "is_custom_domain": true,
    "status": "active_paid",
    "key_date": "2026-07-27",
    "date_type": "renewal",
    "circle_tags": ""
  }
]

Rules:
- "Website renews on <date>" → status: "active_paid", date_type: "renewal"
- "Website trial expires on <date>" → status: "active_trial", date_type: "trial_expiry"
- "Website expired on <date>" → status: "expired_paid", date_type: "expiry"
- "Website trial expired" (no date) → status: "trial_expired", date_type: "none", key_date: null
- Dates to ISO format YYYY-MM-DD
- is_custom_domain: true if the URL does NOT end in .squarespace.com
- circle_tags: comma-separated tag string, or "" if none
- Include every site found; do not skip any

Dashboard text:
{DASHBOARD_TEXT}`
