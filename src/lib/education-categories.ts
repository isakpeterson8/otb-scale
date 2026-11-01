export const EDUCATION_CATEGORIES = [
  { slug: 'orientation',                   label: 'Welcome & Orientation' },
  { slug: 'mindset',                       label: 'Mindset & Success' },
  { slug: 'ideal-student',                 label: 'Ideal Student' },
  { slug: 'marketing',                     label: 'Marketing' },
  { slug: 'facebook-group-self-promotion', label: 'Facebook Group Self-Promotion' },
  { slug: 'schools-orgs',                  label: 'Schools & Orgs' },
  { slug: 'structure',                     label: 'Studio Structure & Policy' },
  { slug: 'tuition',                       label: 'Tuition & Rates' },
  { slug: 'instruction',                   label: 'Instruction Models' },
  { slug: 'a-la-carte',                    label: 'A La Carte' },
  { slug: 'consultations',                 label: 'Trials & Consultations' },
  { slug: 'enrollment',                    label: 'Long-Term Enrollment' },
  { slug: 'efficiency',                    label: 'Resources & Efficiency' },
  { slug: 'summer',                        label: 'Summer' },
  { slug: 'summer-programming',            label: 'Summer Programming & Camps' },
  { slug: 'summer-scheduling',             label: 'Summer Scheduling' },
  { slug: 'studio-space',                  label: 'Finding a Studio' },
  { slug: 'affiliate',                     label: 'Referrals & Affiliates' },
  { slug: 'squarespace',                   label: 'Squarespace & Website' },
  { slug: 'llc',                           label: 'LLC' },
  { slug: 'tax',                           label: 'Tax' },
  { slug: 'finance',                       label: 'Finance' },
  { slug: 'ic',                            label: 'Independent Contractors' },
  { slug: 'content',                       label: 'Content Creation' },
] as const

export type EducationCategorySlug = typeof EDUCATION_CATEGORIES[number]['slug']

// Library items hidden from the member-facing Education Library (grid, search,
// category counts, deep links). Still visible and editable in /admin/library.
// Remove an ID here to unhide it.
export const HIDDEN_LIBRARY_ITEM_IDS: ReadonlySet<string> = new Set([
  '18e2ab1e-cfd8-44e6-83ab-75e79cdf54b4', // "Your Work Plan" (orientation, slug: your-work-plan)
])

export function excludeHiddenLibraryItems<T extends { id: string }>(items: T[]): T[] {
  return items.filter(i => !HIDDEN_LIBRARY_ITEM_IDS.has(i.id))
}
