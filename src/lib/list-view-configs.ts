import type { ListViewConfig } from './list-view'
import { LEAD_SOURCES, LEAD_STATUSES, SCHOOL_STAGES } from '@/types/database'

/** /leads — the Leads tab only (Organic Outreach and Waitlist keep their own views). */
export const LEADS_VIEW: ListViewConfig = {
  storageKey: 'listView:leads',
  nameColumn: 'name',
  nameLabel: 'Name',
  statusColumn: 'status',
  statusRankColumn: 'status_rank',
  statusLabel: 'Status',
  statusOptions: LEAD_STATUSES.map(({ value, label }) => ({ value, label })),
  statusNoneLabel: 'Not triaged',
  sourceColumn: 'lead_source',
  sourceKeyColumn: 'lead_source_key',
  sourceOptions: LEAD_SOURCES.map(({ value, label }) => ({ value, label })),
  sourceNoneLabel: 'No source',
  searchColumns: ['name', 'email'],
  searchPlaceholder: 'Search name or email…',
  followUp: { kind: 'equals', column: 'status', value: 'future follow-up' },
}

/**
 * /school-outreach. School source is free text, so its chips come from the data.
 * Search also matches contact name/email: the page looks those up in
 * school_contacts and passes the school ids to applyListView.
 */
export const SCHOOLS_VIEW: ListViewConfig = {
  storageKey: 'listView:school-outreach',
  nameColumn: 'school_name',
  nameLabel: 'School name',
  statusColumn: 'stage',
  statusRankColumn: 'stage_rank',
  statusLabel: 'Stage',
  statusOptions: SCHOOL_STAGES.map(({ value, label }) => ({ value, label })),
  sourceColumn: 'source',
  sourceKeyColumn: 'source_key',
  sourceNoneLabel: 'No source',
  searchColumns: ['school_name'],
  searchPlaceholder: 'Search school or contact…',
  followUp: { kind: 'due_by_today', column: 'next_step_due_date' },
}
