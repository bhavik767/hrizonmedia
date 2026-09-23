import type { CollectionConfig } from 'payload'

export const Organisations: CollectionConfig = {
  slug: 'organisations',
  access: {
    admin: () => false,
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  admin: { hidden: true, useAsTitle: 'name' },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: ['active', 'deleted'],
      required: true,
    },
  ],
  timestamps: true,
}
