// Designer access: emails granted access to ONLY the admin Canva tab
// (/admin?tab=canva). Server-side only — mirrors the ADMIN_EMAILS pattern.
// Override the default list with a comma-separated DESIGNER_EMAILS env var.
export function getDesignerEmails(): string[] {
  return (process.env.DESIGNER_EMAILS ?? 'design@outsidethebachs.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isDesignerEmail(email: string | null | undefined): boolean {
  return !!email && getDesignerEmails().includes(email.toLowerCase())
}
