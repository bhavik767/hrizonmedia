import type { Block } from 'payload'

/**
 * A Key takeaway is a single claim from the Article, written so it stands alone
 * without the paragraph it came from. The block groups them so a reader who
 * never scrolls still leaves with the argument.
 *
 * The heading is optional because the box is recognisable without one; the
 * statements are not, because a box with nothing in it is a box.
 */
export const KeyTakeaways: Block = {
  slug: 'keyTakeaways',
  interfaceName: 'KeyTakeawaysBlock',
  labels: {
    singular: 'Key takeaways',
    plural: 'Key takeaways',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: {
        description: 'Optional. Left blank, the box is still labelled Key takeaways.',
      },
    },
    {
      name: 'takeaways',
      type: 'array',
      labels: {
        singular: 'Key takeaway',
        plural: 'Key takeaways',
      },
      minRows: 1,
      required: true,
      fields: [
        {
          name: 'statement',
          type: 'textarea',
          admin: {
            description: 'One claim, written so it makes sense out of context.',
          },
          label: false,
          required: true,
        },
      ],
    },
  ],
}
