import type { CollectionConfig } from 'payload'

export const ProcessingJobs: CollectionConfig = {
  slug: 'processing-jobs',
  access: {
    admin: () => false,
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  admin: { hidden: true, useAsTitle: 'providerJobId' },
  fields: [
    { name: 'providerJobId', type: 'text', required: true, unique: true, index: true },
    {
      name: 'asset',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
      unique: true,
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'pilot-members',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      options: ['queued', 'processing', 'ready', 'failed'],
      required: true,
    },
    { name: 'queuedAt', type: 'date', required: true },
  ],
  timestamps: true,
}
