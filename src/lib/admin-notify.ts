// Admin / internal notification emails (tier upgrades, concierge requests,
// Canva requests). Every one is CC'd to ADMIN_NOTIFICATION_CC so support sees
// it. Server-side only. Never use this for member-facing email.
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'Outside The Bachs <noreply@outsidethebachs.com>'

function splitEmails(list: string): string[] {
  return list.split(',').map(e => e.trim()).filter(Boolean)
}

/** OTB admins who receive platform notifications. */
export function getAdminNotifyEmails(): string[] {
  return splitEmails(process.env.ADMIN_NOTIFY_EMAILS ?? process.env.ADMIN_EMAILS ?? '')
}

/** Set ADMIN_NOTIFICATION_CC to an empty string to turn the CC off. */
function getNotificationCc(): string[] {
  return splitEmails(process.env.ADMIN_NOTIFICATION_CC ?? 'support@outsidethebachs.com')
}

export async function sendAdminNotification(msg: {
  to: string[]
  subject: string
  text: string
  html?: string
}): Promise<{ error: string | null }> {
  const to = msg.to.map(e => e.trim()).filter(Boolean)
  const toLower = new Set(to.map(e => e.toLowerCase()))
  const cc = getNotificationCc().filter(e => !toLower.has(e.toLowerCase()))

  // With no admin recipients configured, support still gets the notification.
  const recipients = to.length > 0 ? to : cc
  if (recipients.length === 0) return { error: null }

  const { error } = await resend.emails.send({
    from: FROM,
    to: recipients,
    cc: to.length > 0 && cc.length > 0 ? cc : undefined,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  })
  return { error: error ? error.message : null }
}
