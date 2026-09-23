import type { CollectionConfig } from 'payload'

export const OrganisationInvitations: CollectionConfig = {
  slug: 'organisation-invitations',
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
      name: 'role',
      type: 'select',
      options: ['administrator', 'publisher', 'viewer'],
      required: true,
    },
    { name: 'tokenHash', type: 'text', hidden: true, required: true, unique: true, index: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'acceptedAt', type: 'date', hidden: true },
    {
      name: 'acceptedBy',
      type: 'relationship',
      relationTo: 'members',
      hidden: true,
    },
  ],
  timestamps: true,
}
