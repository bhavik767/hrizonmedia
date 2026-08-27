import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { revalidateFooter } from './hooks/revalidateFooter'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
      admin: {
        initCollapsed: true,
        components: {
          RowLabel: '@/Footer/RowLabel#RowLabel',
        },
        description: 'The categories a reader can browse. Shown as the footer’s main links.',
      },
    },
    {
      /*
       * Legal links are held apart from the browse links rather than sharing
       * one array, because they are a different kind of link and the footer
       * sets them a different way: quieter, on the line with the copyright.
       */
      name: 'legalItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 4,
      admin: {
        initCollapsed: true,
        components: {
          RowLabel: '@/Footer/RowLabel#RowLabel',
        },
        description: 'Policy and terms links, set on the legal line.',
      },
      label: 'Legal items',
    },
  ],
  hooks: {
    afterChange: [revalidateFooter],
  },
}
