import type { CollectionConfig } from 'payload'

export const PlatformAdministrators: CollectionConfig = {
  slug: 'platform-administrators',
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
      name: 'member',
      type: 'relationship',
      relationTo: 'pilot-members',
      required: true,
      unique: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: ['active', 'disabled'],
      required: true,
    },
  ],
  timestamps: true,
}
