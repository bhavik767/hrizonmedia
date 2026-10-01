import type { CollectionConfig } from 'payload'

import { MAX_MEDIA_ASSET_BYTES } from '@/media/limits'

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
    {
      name: 'maximumUploadSizeBytes',
      type: 'number',
      defaultValue: MAX_MEDIA_ASSET_BYTES,
      required: true,
    },
    { name: 'setupCompletedAt', type: 'date', required: true },
    { name: 'logoDataUrl', type: 'textarea' },
  ],
  timestamps: true,
}
