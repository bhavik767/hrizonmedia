import type { CollectionConfig } from 'payload'

export const MediaAssets: CollectionConfig = {
  slug: 'media-assets',
  access: {
    admin: () => false,
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  admin: { hidden: true, useAsTitle: 'fileName' },
  fields: [
    { name: 'mediaAssetId', type: 'text', required: true, unique: true, index: true },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'pilot-members',
      required: true,
      index: true,
    },
    { name: 'fileName', type: 'text', required: true },
    { name: 'mimeType', type: 'text', required: true },
    { name: 'size', type: 'number', required: true },
    {
      name: 'status',
      type: 'select',
      options: ['uploading', 'queued', 'processing', 'ready', 'failed', 'expired', 'deleted'],
      required: true,
    },
    { name: 'statusChangedAt', type: 'date', required: true },
  ],
  timestamps: true,
}
