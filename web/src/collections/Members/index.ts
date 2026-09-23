import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

export const Members: CollectionConfig = {
  slug: 'members',
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
    cookies: {
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    },
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
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Disabled', value: 'disabled' },
      ],
      required: true,
    },
  ],
  hooks: {
    beforeLogin: [
      ({ user }) => {
        if (user.status !== 'active') {
          throw new APIError('This Member has been disabled.', 403)
        }
      },
    ],
  },
  timestamps: true,
}
