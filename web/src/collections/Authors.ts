import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { linkGroup } from '@/fields/linkGroup'
import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

// A content-side "byline" collection, distinct from `Users` (which is the admin login/auth
// collection and is access-locked to protect user privacy). Posts and Pages reference authors
// from here so a byline can carry a public bio/credentials profile (E-E-A-T) without exposing
// any admin account.
export const Authors: CollectionConfig = {
  slug: 'authors',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    group: 'Content',
    defaultColumns: ['name', 'jobTitle', 'updatedAt'],
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'jobTitle',
      type: 'text',
      label: 'Job Title',
    },
    {
      name: 'profileImage',
      type: 'upload',
      label: 'Profile Image',
      relationTo: 'media',
    },
    {
      name: 'description',
      type: 'richText',
      label: 'Description',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
        },
      }),
    },
    {
      name: 'expertise',
      type: 'text',
      label: 'Author Expertise',
      hasMany: true,
      admin: {
        description: 'Areas of expertise, e.g. "JEE Physics", "NEET Biology".',
      },
    },
    {
      name: 'profileURL',
      type: 'text',
      label: 'Profile URL',
      admin: {
        description: "URL to this author's bio/credentials page (e.g. /authors/jane-doe or a full https:// link).",
      },
      validate: (value: string | null | undefined) => {
        if (!value) return true
        try {
          // eslint-disable-next-line no-new
          new URL(value, 'https://example.com')
          return true
        } catch {
          return 'Please enter a valid URL.'
        }
      },
    },
    linkGroup({
      appearances: false,
      overrides: {
        name: 'authorLinks',
        label: 'Author Links',
        admin: {
          initCollapsed: true,
          description: 'Social profiles, personal site, or other external links.',
        },
      },
    }),
  ],
  timestamps: true,
}
