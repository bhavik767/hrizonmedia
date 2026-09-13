import type { Block } from 'payload'

export const GlobalCarousel: Block = {
  slug: 'globalCarousel',
  interfaceName: 'GlobalCarouselBlock',
  labels: {
    plural: 'Global Carousels',
    singular: 'Global Carousel',
  },
  fields: [
    {
      name: 'reusableBlock',
      type: 'relationship',
      admin: {
        description:
          'Pick an existing shared carousel. Editing that carousel later updates every page/post that references it — it is not copied here.',
      },
      filterOptions: {
        blockType: {
          equals: 'carousel',
        },
      },
      relationTo: 'reusable-blocks',
      required: true,
    },
  ],
}
