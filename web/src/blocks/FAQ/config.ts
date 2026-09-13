import type { Block } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

// This block's own field shape (question/answer items) is used two ways: as the `content` for
// a shared FAQ document in the ReusableBlocks collection (ADR-011 — imported into a post/page
// via the FAQ tab's "Import Shared FAQ" field, see src/fields/faq.ts), and previously as an
// inline content block, which has been superseded by that dedicated FAQ tab — a post/page
// simply "has FAQ" via that tab rather than via a block dropped into the page flow. See
// adrs/adr-012-structured-data-implementation.md.
export const FAQ: Block = {
  slug: 'faq',
  interfaceName: 'FAQBlock',
  labels: {
    plural: 'FAQs',
    singular: 'FAQ',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: {
        description: 'Optional heading shown above the FAQ list (e.g. "Frequently Asked Questions").',
      },
    },
    {
      name: 'items',
      type: 'array',
      labels: {
        plural: 'Questions',
        singular: 'Question',
      },
      minRows: 1,
      admin: {
        initCollapsed: true,
        components: {
          RowLabel: '@/blocks/FAQ/RowLabel#RowLabel',
        },
      },
      fields: [
        {
          name: 'question',
          type: 'text',
          required: true,
        },
        {
          name: 'answer',
          type: 'richText',
          required: true,
          editor: lexicalEditor({
            features: ({ rootFeatures }) => {
              return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
            },
          }),
        },
      ],
    },
  ],
}
