import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { Carousel } from '../../blocks/Carousel/config'
import { FAQ } from '../../blocks/FAQ/config'
import { revalidateDelete, revalidateReusableBlock } from './hooks/revalidateReusableBlock'

// See adrs/adr-011-reusable-global-blocks.md. Each document here is a single piece of shared
// content (e.g. one carousel) that pages/posts reference via a "Global" block (e.g. Global
// Carousel) instead of copying its data inline. Editing a document here updates every place
// that references it, since referencing documents only ever store a pointer to it.
export const ReusableBlocks: CollectionConfig<'reusable-blocks'> = {
  slug: 'reusable-blocks',
  labels: {
    plural: 'Reusable Blocks',
    singular: 'Reusable Block',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'blockType', 'updatedAt'],
    group: 'Content',
    description:
      'Shared content referenced by pages/posts via a "Global" block. Editing a document here updates every place that references it — see adrs/adr-011-reusable-global-blocks.md.',
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      admin: {
        description:
          'Internal label used to find this in the block picker. Not shown on the live site.',
      },
      required: true,
    },
    {
      name: 'blockType',
      type: 'select',
      admin: {
        description:
          'Determines which fields below apply, and which "Global" block picker (e.g. Global Carousel) this shows up in. Add more options here as new reusable block types are introduced.',
      },
      options: [
        {
          label: 'Carousel',
          value: 'carousel',
        },
        {
          label: 'FAQ',
          value: 'faq',
        },
      ],
      required: true,
    },
    {
      name: 'content',
      type: 'blocks',
      admin: {
        description: 'Add exactly one block here, matching the type selected above.',
      },
      blocks: [Carousel, FAQ],
      maxRows: 1,
      minRows: 1,
    },
  ],
  hooks: {
    afterChange: [revalidateReusableBlock],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100,
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
