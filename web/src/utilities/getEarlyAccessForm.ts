import type { Form } from '@/payload-types'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import { earlyAccessForm } from '@/forms/earlyAccess'

/**
 * The form the capture submits against, looked up once per request however many
 * times the capture appears on the page.
 *
 * It is found by title rather than held in configuration because the form is a
 * document the Author can see and edit in the admin panel — where the
 * submissions they came for are also read. `ensureEarlyAccessForm` puts it
 * there on boot; this only reads it.
 */
export const getEarlyAccessForm = cache(async (): Promise<Form | null> => {
  const payload = await getPayload({ config: configPromise })

  const forms = await payload.find({
    collection: 'forms',
    depth: 0,
    limit: 1,
    pagination: false,
    where: { title: { equals: earlyAccessForm.title } },
  })

  return forms.docs[0] ?? null
})
