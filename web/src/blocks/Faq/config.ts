import type { Block } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

/**
 * The adjacent questions a reader arrives with, answered in place.
 *
 * Questions are plain text so they can be slugified into anchors and read as
 * headings; answers are rich text so they can carry a link to the section that
 * covers the point at length. An Article may hold more than one of these,
 * addressing different clusters in different places.
 */
export const Faq: Block = {
  slug: 'faq',
  interfaceName: 'FaqBlock',
  labels: {
    singular: 'FAQ',
    plural: 'FAQs',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: {
        description:
          'Optional. Left blank, the section is still labelled Frequently asked questions.',
      },
    },
    {
      name: 'questions',
      type: 'array',
      labels: {
        singular: 'Question',
        plural: 'Questions',
      },
      minRows: 1,
      required: true,
      fields: [
        {
          name: 'question',
          type: 'text',
          required: true,
        },
        {
          name: 'answer',
          type: 'richText',
          editor: lexicalEditor({
            features: ({ rootFeatures }) => {
              return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
            },
          }),
          required: true,
        },
      ],
    },
  ],
}
