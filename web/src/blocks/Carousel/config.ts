import type { Block } from 'payload'

import { link } from '../../fields/link'

export const Carousel: Block = {
  slug: 'carousel',
  interfaceName: 'CarouselBlock',
  labels: {
    plural: 'Carousels',
    singular: 'Carousel',
  },
  fields: [
    {
      name: 'slides',
      type: 'array',
      labels: {
        plural: 'Slides',
        singular: 'Slide',
      },
      minRows: 1,
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'heading',
          type: 'text',
        },
        {
          name: 'caption',
          type: 'textarea',
        },
        {
          name: 'enableLink',
          type: 'checkbox',
          label: 'Enable Link',
        },
        link({
          overrides: {
            admin: {
              condition: (_, siblingData) => Boolean(siblingData?.enableLink),
            },
          },
        }),
      ],
    },
  ],
}
