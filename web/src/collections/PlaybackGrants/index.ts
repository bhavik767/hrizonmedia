import type { CollectionConfig } from 'payload'

export const PlaybackGrants: CollectionConfig = {
  slug: 'playback-grants',
  access: {
    admin: () => false,
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  admin: { hidden: true, useAsTitle: 'playbackGrantId' },
  fields: [
    { name: 'playbackGrantId', type: 'text', required: true, unique: true, index: true },
    { name: 'organisation', type: 'relationship', relationTo: 'organisations', index: true },
    {
      name: 'asset',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
      index: true,
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'pilot-members',
      required: true,
      index: true,
    },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'deliveryExpiresAt', type: 'date', required: true, index: true },
    { name: 'leakId', type: 'text', required: true, unique: true, index: true },
    { name: 'leakIdIssuedAt', type: 'date', required: true, index: true },
  ],
  timestamps: true,
}
