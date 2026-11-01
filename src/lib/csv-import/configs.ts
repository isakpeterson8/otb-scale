import type { ImportConfig } from './core'
import { LEAD_SOURCES, LEAD_STATUSES, SCHOOL_STAGES } from '@/types/database'

const opts = (list: { value: string; label: string }[]) => list.map(({ value, label }) => ({ value, label }))

/**
 * Leads (contacts table). `source` maps to contacts.lead_source.
 * Field order is the template's column order.
 */
export const LEADS_IMPORT: ImportConfig = {
  entity: 'leads',
  noun: 'lead',
  templateFilename: 'leads-import-template.csv',
  fields: [
    { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 200,
      aliases: ['full name', 'student name', 'student', 'lead name', 'lead'], example: 'Jamie Rivera' },
    { key: 'guardian_name', label: 'Guardian name', kind: 'text', maxLength: 200,
      aliases: ['guardian', 'parent', 'parent name', 'decision maker'], example: 'Alex Rivera' },
    { key: 'email', label: 'Email', kind: 'email', maxLength: 320,
      aliases: ['email address', 'e-mail', 'mail', 'parent email'], example: 'alex.rivera@example.com' },
    { key: 'phone', label: 'Phone', kind: 'text', maxLength: 50,
      aliases: ['phone number', 'mobile', 'cell', 'telephone'], example: '(555) 010-2030' },
    { key: 'source', label: 'Source', kind: 'enum', options: opts(LEAD_SOURCES),
      aliases: ['lead source', 'how did you hear', 'channel'], example: 'Referral' },
    { key: 'status', label: 'Status', kind: 'enum', options: opts(LEAD_STATUSES),
      aliases: ['stage', 'lead status', 'pipeline'], example: 'To Be Contacted' },
    { key: 'notes', label: 'Notes', kind: 'text', maxLength: 5000,
      aliases: ['note', 'comments', 'comment'], example: 'Interested in piano, Tuesdays' },
  ],
}

/**
 * Schools: one row per contact. Rows with the same school_name + city + state
 * become one school with several contacts. School-level columns (city, type,
 * source, status, notes) are taken from the first row of each school that
 * has them.
 */
export const SCHOOLS_IMPORT: ImportConfig = {
  entity: 'schools',
  noun: 'school',
  templateFilename: 'schools-import-template.csv',
  fields: [
    { key: 'school_name', label: 'School name', kind: 'text', required: true, maxLength: 200,
      aliases: ['school', 'name of school', 'organization'], example: 'Lincoln Elementary' },
    { key: 'city', label: 'City', kind: 'text', maxLength: 100, aliases: ['town'], example: 'Springfield' },
    { key: 'state', label: 'State', kind: 'text', maxLength: 50, aliases: ['st', 'province', 'region'], example: 'IL' },
    { key: 'school_type', label: 'School type', kind: 'text', maxLength: 100,
      aliases: ['type', 'level', 'grade level'], example: 'Elementary' },
    { key: 'source', label: 'Source', kind: 'text', maxLength: 100,
      aliases: ['lead source', 'list'], example: 'District directory' },
    { key: 'status', label: 'Stage', kind: 'enum', options: opts(SCHOOL_STAGES),
      aliases: ['stage', 'pipeline stage'], example: 'Lead' },
    { key: 'contact_name', label: 'Contact name', kind: 'text', maxLength: 200,
      aliases: ['contact', 'name', 'contact person', 'teacher', 'teacher name'], example: 'Dana Brooks' },
    { key: 'contact_title', label: 'Contact title', kind: 'text', maxLength: 100,
      aliases: ['title', 'role', 'position', 'job title'], example: 'Band Director' },
    { key: 'contact_email', label: 'Contact email', kind: 'email', maxLength: 320,
      aliases: ['email', 'email address', 'e-mail', 'teacher email'], example: 'dbrooks@lincoln.k12.example' },
    { key: 'contact_phone', label: 'Contact phone', kind: 'text', maxLength: 50,
      aliases: ['phone', 'phone number', 'telephone'], example: '(555) 010-4455' },
    { key: 'is_primary', label: 'Primary contact', kind: 'boolean',
      aliases: ['primary', 'main contact'], example: 'yes' },
    { key: 'notes', label: 'Notes', kind: 'text', maxLength: 5000,
      aliases: ['note', 'comments', 'comment'], example: 'Met at district music fair' },
  ],
}
