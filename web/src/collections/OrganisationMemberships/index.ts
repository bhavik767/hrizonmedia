import type { CollectionConfig } from 'payload'

export const OrganisationMemberships: CollectionConfig = {
  slug: 'organisation-memberships',
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
      name: 'organisation',
      type: 'relationship',
      relationTo: 'organisations',
      required: true,
      index: true,
    },
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      index: true,
    },
    {
      name: 'role',
      type: 'select',
      options: ['administrator', 'publisher', 'viewer'],
      required: true,
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
