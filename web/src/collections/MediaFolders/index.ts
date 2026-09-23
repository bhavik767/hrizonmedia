import type { CollectionConfig } from 'payload'

export const MediaFolders: CollectionConfig = {
  slug: 'media-folders',
  access: { admin: () => false, create: () => false, delete: () => false, read: () => false, update: () => false },
  admin: { hidden: true, useAsTitle: 'name' },
  fields: [
    { name: 'organisation', type: 'relationship', relationTo: 'organisations', required: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'owner', type: 'relationship', relationTo: 'pilot-members', required: true, index: true },
  ],
  timestamps: true,
}
