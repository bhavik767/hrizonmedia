import React from 'react'

import { getEarlyAccessForm } from '@/utilities/getEarlyAccessForm'

import { EmailCaptureForm } from './Form'

/**
 * The site's single ask, wherever it appears: the sticky sidebar beside an
 * Article, the end of the Article body, and the footer. All three submit to the
 * same form, so a reader reaches the same list whichever one convinced them.
 *
 * Renders nothing at all if the form is missing. A capture that takes an
 * address and drops it is worse than an empty corner.
 */
export async function EmailCapture({ className }: { className?: string }) {
  const form = await getEarlyAccessForm()

  if (!form) return null

  return <EmailCaptureForm className={className} formId={form.id} />
}
