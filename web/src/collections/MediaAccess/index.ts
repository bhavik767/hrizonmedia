import type { CollectionConfig } from 'payload'

export const MediaAccess: CollectionConfig = {
  slug: 'media-access',
  access: {
    admin: () => false,
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  admin: { hidden: true, useAsTitle: 'id' },
  fields: [
    {
      name: 'asset',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
      index: true,
    },
    {
      name: 'membership',
      type: 'relationship',
      relationTo: 'organisation-memberships',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: ['active', 'revoked'],
      required: true,
    },
  ],
  timestamps: true,
}
