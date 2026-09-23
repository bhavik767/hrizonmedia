import type { CollectionConfig } from 'payload'
import { auditActions } from '@/audit/actions'

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
    { name: 'organisation', type: 'relationship', relationTo: 'organisations', index: true },
    {
      name: 'action',
      type: 'select',
      options: [...auditActions],
      required: true,
      index: true,
    },
    { name: 'member', type: 'relationship', relationTo: 'pilot-members', index: true },
    {
      name: 'asset',
      type: 'relationship',
      relationTo: 'media-assets',
      index: true,
    },
    { name: 'actor', type: 'relationship', relationTo: 'pilot-members', index: true },
    { name: 'occurredAt', type: 'date', required: true, index: true },
    { name: 'details', type: 'json' },
  ],
  timestamps: true,
}
