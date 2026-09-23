import type { CollectionConfig } from 'payload'

export const MediaOperations: CollectionConfig = {
  slug: 'media-operations',
  access: {
    admin: () => false,
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  admin: { hidden: true, useAsTitle: 'key' },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true },
    { name: 'providerConcurrency', type: 'number', required: true, min: 1, max: 100 },
    { name: 'killSwitchEnabled', type: 'checkbox', required: true, defaultValue: false },
    { name: 'updatedBy', type: 'relationship', relationTo: 'members', index: true },
  ],
  timestamps: true,
}
