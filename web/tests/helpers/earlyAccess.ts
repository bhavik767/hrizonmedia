import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { earlyAccessForm } from '../../src/forms/earlyAccess.js'

export type Collected = {
  address: string
  /** Which form the address was signed up against. */
  form: number | string
  /** The submission the Author opens in the admin panel. */
  id: number | string
}

/**
 * What the Author would see in the admin panel: the addresses collected so far,
 * read back through the same collection the panel lists.
 */
export async function collected(): Promise<Collected[]> {
  const payload = await getPayload({ config })

  const submissions = await payload.find({
    collection: 'form-submissions',
    depth: 0,
    limit: 100,
    pagination: false,
    sort: '-createdAt',
  })

  return submissions.docs.flatMap((submission) =>
    (submission.submissionData ?? [])
      .filter((entry) => entry.field === earlyAccessForm.fieldName)
      .map((entry) => ({
        address: String(entry.value),
        form: typeof submission.form === 'object' ? submission.form.id : submission.form,
        id: submission.id,
      })),
  )
}

export async function collectedAddresses(): Promise<string[]> {
  return (await collected()).map((entry) => entry.address)
}

/** Removes whatever a test signed up, so the next run starts from nothing. */
export async function forgetAddresses(addresses: string[]): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'form-submissions',
    where: { 'submissionData.value': { in: addresses } },
  })
}
