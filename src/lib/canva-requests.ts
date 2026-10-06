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
