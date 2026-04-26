export type UserRole = 'studio_owner' | 'otb_admin' | 'otb_staff'

export interface Studio {
  id: string
  name: string
  owner_id: string
  city: string | null
  state: string | null
  created_at: string
}

export interface Profile {
  id: string
  studio_id: string | null
  role: UserRole
  display_name: string | null
  email: string | null
  created_at: string
}

export interface Contact {
  id: string
  studio_id: string
  name: string
  email: string | null
  phone: string | null
  status: string | null
  source: string | null
  notes: string | null
  created_at: string
}

export interface PipelineEvent {
  id: string
  studio_id: string
  contact_id: string
  stage: string
  notes: string | null
  event_date: string
  created_at: string
  contacts?: Pick<Contact, 'name' | 'email'>
}

export interface EmailSend {
  id: string
  studio_id: string
  contact_id: string | null
  template_id: string | null
  subject: string
  body_id: string | null
  sent_at: string
  contacts?: Pick<Contact, 'name' | 'email'>
  email_bodies?: Pick<EmailBody, 'content'>
}

export interface EmailBody {
  id: string
  content: string
  created_at: string
}

export interface EmailTemplate {
  id: string
  studio_id: string
  name: string
  subject: string
  body: string
  created_at: string
}

export interface CadenceQueueItem {
  id: string
  studio_id: string
  contact_id: string
  template_id: string
  scheduled_at: string
  sent_at: string | null
  status: string
  contacts?: Pick<Contact, 'name' | 'email'>
  email_templates?: Pick<EmailTemplate, 'name' | 'subject'>
}

export interface FinancialMonth {
  id: string
  studio_id: string
  month: string
  revenue: number | null
  expenses: number | null
  notes: string | null
}

export type PipelineStage =
  | 'lead'
  | 'consultation'
  | 'possible_registration'
  | 'new_enrollment'
  | 'disenrolled'

export const PIPELINE_STAGES: { value: PipelineStage; label: string; color: string }[] = [
  { value: 'lead', label: 'Lead', color: 'var(--ink-3)' },
  { value: 'consultation', label: 'Consultation', color: 'var(--amber)' },
  { value: 'possible_registration', label: 'Possible Registration', color: 'var(--accent-text)' },
  { value: 'new_enrollment', label: 'New Enrollment', color: 'var(--green)' },
  { value: 'disenrolled', label: 'Disenrolled', color: 'var(--red)' },
]

export type LeadSource =
  | 'facebook_group_third_party'
  | 'facebook_group_self_promo'
  | 'school_visit'
  | 'inbound_online'
  | 'referral'

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'facebook_group_third_party', label: 'Facebook Group - 3rd Party' },
  { value: 'facebook_group_self_promo', label: 'Facebook Group - Self Promo' },
  { value: 'school_visit', label: 'School Visit' },
  { value: 'inbound_online', label: 'Inbound Online' },
  { value: 'referral', label: 'Referral' },
]

export type PostType = 'self_promo' | 'third_party' | 'both'

export interface FacebookGroup {
  id: string
  studio_id: string
  group_name: string
  group_url: string | null
  group_location: string | null
  group_membership_size: number | null
  shared_with: string | null
  application_date: string | null
  acceptance_date: string | null
  most_recent_post_date: string | null
  posting_rules: string | null
  post_type: PostType | null
  is_active: boolean
  created_at: string
}

export type SchoolOutreachStage =
  | 'lead'
  | 'initial_contact'
  | 'replied'
  | 'classroom_visit_offered'
  | 'visit_scheduled'
  | 'visit_completed'
  | 'not_interested'

export const SCHOOL_STAGES: { value: SchoolOutreachStage; label: string; bg: string; text: string }[] = [
  { value: 'lead',                     label: 'Lead',                    bg: 'rgba(0,0,0,0.05)',        text: 'rgba(0,0,0,0.4)' },
  { value: 'initial_contact',          label: 'Initial Contact',         bg: 'rgba(4,173,239,0.12)',    text: '#0284a8' },
  { value: 'replied',                  label: 'Replied',                 bg: 'rgba(180,83,9,0.12)',     text: '#b45309' },
  { value: 'classroom_visit_offered',  label: 'Visit Offered',           bg: 'rgba(180,83,9,0.18)',     text: '#92400e' },
  { value: 'visit_scheduled',          label: 'Visit Scheduled',         bg: 'rgba(109,40,217,0.1)',    text: '#6d28d9' },
  { value: 'visit_completed',          label: 'Visit Completed',         bg: 'rgba(22,163,74,0.12)',    text: '#15803d' },
  { value: 'not_interested',           label: 'Not Interested',          bg: 'rgba(220,38,38,0.1)',     text: '#b91c1c' },
]

export interface SchoolOutreach {
  id: string
  studio_id: string
  school_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  stage: SchoolOutreachStage
  first_contact_date: string | null
  last_interacted_date: string | null
  next_step: string | null
  next_step_due_date: string | null
  probability: number | null
  progress: number | null
  notes: string | null
  created_at: string
}

export type CadenceStatus = 'active' | 'completed' | 'removed' | 'replied'
export type OpeningTemplateKey = 'initial_contact' | 'familiar_teacher' | 'shared_student' | 'virtual'

export interface CadenceEnrollment {
  id: string
  school_id: string
  user_id: string
  opening_template: OpeningTemplateKey
  current_email_number: number
  email_1_sent_at: string | null
  email_2_sent_at: string | null
  email_3_sent_at: string | null
  email_4_sent_at: string | null
  email_2_due_at: string | null
  email_3_due_at: string | null
  email_4_due_at: string | null
  status: CadenceStatus
  removed_at: string | null
  removal_reason: string | null
  gmail_thread_id: string | null
  created_at: string
}

export interface UserSettings {
  id: string
  user_id: string
  display_name: string | null
  studio_name: string | null
  location: string | null
  phone: string | null
  instruments: string | null
  sender_name: string | null
  reply_to_email: string | null
  gmail_send_enabled: boolean
  gmail_access_token: string | null
  gmail_refresh_token: string | null
  gmail_token_expiry: string | null
  created_at: string
  updated_at: string
}
