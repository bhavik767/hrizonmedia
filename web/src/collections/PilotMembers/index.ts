import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

export const PilotMembers: CollectionConfig = {
  slug: 'pilot-members',
  access: {
    admin: () => false,
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  admin: {
    hidden: true,
    useAsTitle: 'email',
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      options: [
        { label: 'Uploader', value: 'uploader' },
        { label: 'Operator', value: 'operator' },
      ],
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Disabled', value: 'disabled' },
      ],
      required: true,
    },
    {
      name: 'invitationTokenHash',
      type: 'text',
      hidden: true,
      index: true,
    },
    {
      name: 'invitationExpiresAt',
      type: 'date',
      hidden: true,
    },
    {
      name: 'invitationAcceptedAt',
      type: 'date',
      hidden: true,
    },
  ],
  hooks: {
    beforeLogin: [
      ({ user }) => {
        if (user.status !== 'active') {
          throw new APIError('This Pilot Member has been disabled.', 403)
        }

        if (!user.invitationAcceptedAt) {
          throw new APIError('Finish setting up your Pilot Member password first.', 403)
        }
      },
    ],
  },
  timestamps: true,
}
