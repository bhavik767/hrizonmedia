import type { Tab } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

// A post/page simply "has FAQ" or it doesn't — this is a dedicated tab (like SEO), not a
// content block dropped into the page flow, and not gated behind the Structured Data selector.
// If this tab has content — written directly, imported from a shared FAQ (ADR-011), or both,
// combined — FAQ schema is generated automatically; if it's empty, it isn't. Always renders on
// the front end directly after the main content and before related posts (Pages: after the
// layout, since there's no "related" section there). See
// adrs/adr-012-structured-data-implementation.md.
export const faqTab: Tab = {
  name: 'faq',
  label: 'FAQ',
  fields: [
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Frequently Asked Questions',
      admin: {
        description: 'Heading shown above the FAQ section. Pre-filled — change or clear it as needed.',
      },
    },
    {
      name: 'items',
      type: 'array',
      label: 'Questions',
      labels: {
        plural: 'Questions',
        singular: 'Question',
      },
      admin: {
        initCollapsed: true,
        description: 'Written directly for this post/page.',
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
    {
      name: 'importedFAQ',
      type: 'relationship',
      label: 'Import Shared FAQ',
      hasMany: true,
      relationTo: 'reusable-blocks',
      filterOptions: {
        blockType: {
          equals: 'faq',
        },
      },
      admin: {
        description:
          'Pull in one or more shared FAQs (see Reusable Blocks). Combines with the questions above rather than replacing them — editing the shared FAQ later updates it here too.',
      },
    },
  ],
}
