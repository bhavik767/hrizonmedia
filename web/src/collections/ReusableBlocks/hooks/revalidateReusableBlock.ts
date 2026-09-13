import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { revalidatePath } from 'next/cache'

import type { ReusableBlock } from '../../../payload-types'

// A reusable block (e.g. a Global Carousel's source document) can be referenced from an
// unbounded, unknown set of pages and posts. Rather than maintaining a reverse-index of every
// document that references a given reusable block, we take the simpler, coarser approach of
// revalidating every route under the frontend's root layout whenever one is published/
// unpublished. Pages/posts that don't reference the edited block just get an extra (cheap)
// regeneration. If the page count grows large enough for that to matter, this is the place to
// switch to a targeted reverse-index. See adrs/adr-011-reusable-global-blocks.md.
export const revalidateReusableBlock: CollectionAfterChangeHook<ReusableBlock> = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      payload.logger.info(
        `Revalidating all pages after reusable block "${doc.name}" was published`,
      )
      revalidatePath('/', 'layout')
    }

    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      payload.logger.info(
        `Revalidating all pages after reusable block "${doc.name}" was unpublished`,
      )
      revalidatePath('/', 'layout')
    }
  }

  return doc
}

export const revalidateDelete: CollectionAfterDeleteHook<ReusableBlock> = ({
  doc,
  req: { context },
}) => {
  if (!context.disableRevalidate) {
    revalidatePath('/', 'layout')
  }

  return doc
}
