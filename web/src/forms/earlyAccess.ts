import type { Payload } from 'payload'

/**
 * The site's single ask, as a form-builder form.
 *
 * One form and one field, defined here rather than left to the Author to build
 * by hand, because both Article placements and the footer submit to the same
 * form: a reader must reach the same list wherever they signed up from.
 */
export const earlyAccessForm = {
  fieldName: 'email',
  fieldLabel: 'Email address',
  title: 'Early access',
} as const

/**
 * The words the capture says, in one place because it appears three times.
 *
 * The first three are fixed by the brief and are not to be improvised. The
 * button names its outcome, per the brand book — "Subscribe", "Sign up" and
 * "Submit" would each sit on any button on any site, which is what makes them
 * wrong here. The supporting line says plainly that there is nothing to use
 * yet, so nobody signs up expecting a product today.
 */
export const earlyAccessCopy = {
  heading: 'Be first when hrizonmedia opens',
  supporting: "We'll email you once, when it's ready",
  button: 'Get early access',
  /* The three states a reader can end up in, each said in canonical language. */
  sending: 'Sending your address',
  success: "You're on the list. We'll email you once, when it's ready.",
  failure: "That didn't send. Please try again.",
  invalid: 'Enter an email address so we know where to write.',
} as const

/**
 * Creates the form if the site does not have it yet, and does nothing if it
 * does. Called on boot, so a fresh database has somewhere to put an address
 * before the first reader arrives — the capture is the only conversion surface
 * on the site, and it cannot wait on someone remembering to build a form.
 *
 * No `emails` are configured, deliberately. The form builder sends on
 * submission when that array is populated, and this project has no transport:
 * nothing is sent, and nothing is promised to be.
 */
export async function ensureEarlyAccessForm(payload: Payload): Promise<void> {
  const existing = await payload.find({
    collection: 'forms',
    depth: 0,
    limit: 1,
    pagination: false,
    where: { title: { equals: earlyAccessForm.title } },
  })

  if (existing.docs.length > 0) return

  await payload.create({
    collection: 'forms',
    data: {
      /*
       * The capture renders its own confirmation, so this message is never the
       * thing a reader sees. It is required by the collection, and saying the
       * same words keeps the admin panel describing what actually happens.
       */
      confirmationMessage: confirmation(earlyAccessCopy.success),
      confirmationType: 'message',
      emails: [],
      fields: [
        {
          name: earlyAccessForm.fieldName,
          blockName: earlyAccessForm.fieldName,
          blockType: 'email',
          label: earlyAccessForm.fieldLabel,
          required: true,
          width: 100,
        },
      ],
      submitButtonLabel: earlyAccessCopy.button,
      title: earlyAccessForm.title,
    },
  })
}

/** The lexical shape a single-paragraph rich text field is stored as. */
function confirmation(message: string) {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: message,
              version: 1,
            },
          ],
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          textFormat: 0,
          version: 1,
        },
      ],
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
    },
  }
}
