import type { CanvaRequestType } from '@/types/database'
import type { RequestTypeOption } from '@/components/ui/RequestTypePicker'

/**
 * One source of truth for Canva request types, shared by the member form, the
 * admin table and the designer notification email. Lives here rather than in
 * the actions file because a 'use server' module may only export async
 * functions.
 */

export const CANVA_TYPE_OPTIONS: readonly RequestTypeOption<CanvaRequestType>[] = [
  { value: 'new_build', label: 'New flyer build',       description: 'I need a brand-new flyer built from scratch' },
  { value: 'refresh',   label: 'Refresh existing flyer', description: 'Update an already live Canva project' },
  { value: 'support',   label: 'Support / fix',          description: 'Something on my flyer needs fixing' },
]

export const CANVA_TYPE_LABELS: Record<CanvaRequestType, string> = {
  new_build: 'New flyer build',
  refresh:   'Refresh existing flyer',
  support:   'Support / fix',
}

/** Shown wherever a pre-picker request is displayed. Never a guessed type. */
export const NO_CANVA_TYPE_LABEL = 'No type'

export function isCanvaRequestType(value: unknown): value is CanvaRequestType {
  return typeof value === 'string' && value in CANVA_TYPE_LABELS
}

/** Label for a possibly-missing type, for display only. */
export function canvaTypeLabel(value: CanvaRequestType | null | undefined): string {
  return isCanvaRequestType(value) ? CANVA_TYPE_LABELS[value] : NO_CANVA_TYPE_LABEL
}

/**
 * A brand-new flyer has no Canva project to link to yet, so new_build is the
 * one type that may omit it. Shared by the form and the server action so the
 * two cannot drift.
 *
 * '' (nothing picked yet) counts as required: that is true of two of the three
 * types, so the field does not advertise itself as optional and then tighten.
 */
export function canvaLinkRequired(type: CanvaRequestType | '' | null | undefined): boolean {
  return type !== 'new_build'
}
