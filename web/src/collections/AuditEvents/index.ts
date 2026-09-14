import type { CollectionConfig } from 'payload'

export const AuditEvents: CollectionConfig = {
  slug: 'audit-events',
  access: {
    admin: () => false,
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  admin: { hidden: true, useAsTitle: 'action' },
  fields: [
    { name: 'eventKey', type: 'text', required: true, unique: true, index: true },
    {
      name: 'action',
      type: 'select',
      options: [
        'asset_deleted',
        'asset_expired',
        'access_revoked',
        'source_deleted',
        'outputs_deleted',
      ],
      required: true,
      index: true,
    },
    {
      name: 'asset',
      type: 'relationship',
      relationTo: 'media-assets',
      required: true,
      index: true,
    },
    { name: 'actor', type: 'relationship', relationTo: 'pilot-members', index: true },
    { name: 'occurredAt', type: 'date', required: true, index: true },
    { name: 'details', type: 'json' },
  ],
  timestamps: true,
}
