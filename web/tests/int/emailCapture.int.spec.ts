import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { earlyAccessForm } from '@/forms/earlyAccess'

const ADDRESS = 'int-early-access@example.com'

let payload: Payload

/**
 * The one thing the site asks of a reader, at the collection seam.
 *
 * An address that is taken and then lost is worse than never asking for it, so
 * what is under test is that a submission survives the round trip and can be
 * read back — that is the whole promise the capture makes before launch day.
 */
describe('The early access form', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await remove()
  })

  afterAll(async () => {
    await remove()
  })

  it('asks for one thing and sends nothing back', async () => {
    const form = await findForm()

    expect(form.fields).toHaveLength(1)
    expect(form.fields?.[0]).toMatchObject({
      blockType: 'email',
      name: earlyAccessForm.fieldName,
      required: true,
    })

    /*
     * The form builder emails on submission wherever this array is populated,
     * and there is no transport in this project. An entry here would be a
     * promise the site cannot keep on the one day it matters.
     */
    expect(form.emails ?? []).toHaveLength(0)
  })

  it('keeps an address submitted against it, and hands it back', async () => {
    const form = await findForm()

    const created = await payload.create({
      collection: 'form-submissions',
      data: {
        form: form.id,
        submissionData: [{ field: earlyAccessForm.fieldName, value: ADDRESS }],
      },
    })

    const read = await payload.findByID({ collection: 'form-submissions', id: created.id })

    expect(read.submissionData).toEqual([
      expect.objectContaining({ field: earlyAccessForm.fieldName, value: ADDRESS }),
    ])
  })
})

async function findForm() {
  const forms = await payload.find({
    collection: 'forms',
    where: { title: { equals: earlyAccessForm.title } },
  })

  expect(forms.docs).toHaveLength(1)

  return forms.docs[0]!
}

async function remove(): Promise<void> {
  await payload.delete({
    collection: 'form-submissions',
    where: { 'submissionData.value': { equals: ADDRESS } },
  })
}
