import type { CollectionConfig } from 'payload'

export const OrganisationSettings: CollectionConfig = {
  slug: 'organisation-settings',
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
      unique: true,
    },
    {
      name: 'drmDefault',
      type: 'select',
      defaultValue: 'protected',
      options: ['protected', 'standard'],
      required: true,
    },
    { name: 'drmRequired', type: 'checkbox', defaultValue: false },
    { name: 'defaultRetentionDays', type: 'number', defaultValue: 30, required: true },
    { name: 'maximumUploadSizeBytes', type: 'number', defaultValue: 2 * 1024 * 1024 * 1024, required: true },
    { name: 'setupCompletedAt', type: 'date', required: true },
    { name: 'logoDataUrl', type: 'textarea' },
  ],
  timestamps: true,
}
