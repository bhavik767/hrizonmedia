import type { GlobalConfig } from 'payload'

// URL fields (top-level `url`, and each `sameAs` entry) share this validator.
const validateUrl = (value: string | null | undefined) => {
  if (!value) return true
  try {
    // eslint-disable-next-line no-new
    new URL(value)
    return true
  } catch {
    return 'Please enter a full URL, including https://.'
  }
}

// Site-wide organization info, used as `publisher` for Article/BlogPosting schema and the
// default `provider` for Course schema (see adrs/adr-012-structured-data-implementation.md).
// Edited once here rather than per-document, since this data doesn't vary by post/page.
export const Organization: GlobalConfig = {
  slug: 'organization',
  label: 'Organization',
  admin: {
    group: 'Site',
    description:
      "eSaral's organization info, used to populate schema.org structured data (Article publisher, Course provider) and site-level assets (favicon) across the site.",
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      defaultValue: 'eSaral',
      admin: {
        description: 'Legal/display name used as the schema.org Organization name.',
      },
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description:
          'Canonical site URL (e.g. https://esaral.com). Falls back to the server URL if left blank.',
      },
      validate: validateUrl,
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description:
          'Used as the Organization schema logo (publisher.logo / provider.logo). Google recommends a square or landscape image.',
      },
    },
    {
      name: 'favicon',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Browser tab icon. Accepts .ico, .svg, or .png. Falls back to the static /favicon.ico and /favicon.svg files in the codebase if left blank.',
      },
    },
    {
      name: 'sameAs',
      type: 'array',
      label: 'Social / External Profiles',
      admin: {
        description:
          'Links to official social profiles (Instagram, YouTube, LinkedIn, etc.) — populates schema.org sameAs.',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'url',
          type: 'text',
          required: true,
          validate: validateUrl,
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Organization Schema Details',
      admin: {
        initCollapsed: true,
        description:
          'Optional schema.org Organization properties. Populate what you have — each is only emitted in JSON-LD when filled in.',
      },
      fields: [
        {
          name: 'description',
          type: 'textarea',
          admin: {
            description: 'Short organization description (schema.org description).',
          },
        },
        {
          name: 'legalName',
          type: 'text',
          admin: {
            description: 'Registered legal name, if different from Name above.',
          },
        },
        {
          name: 'alternateName',
          type: 'text',
          admin: {
            description: 'A commonly-used alternate name (e.g. an abbreviation).',
          },
        },
        {
          name: 'email',
          type: 'text',
          admin: {
            description: 'General contact email (schema.org email).',
          },
        },
        {
          name: 'telephone',
          type: 'text',
          admin: {
            description: 'General contact phone number, with country code (schema.org telephone).',
          },
        },
        {
          name: 'foundingDate',
          type: 'date',
          admin: {
            description: 'When eSaral was founded (schema.org foundingDate).',
            date: {
              pickerAppearance: 'dayOnly',
            },
          },
        },
        {
          name: 'founders',
          type: 'array',
          label: 'Founders',
          admin: {
            description:
              "One or more founders — populates schema.org founder (a single Person when there's exactly one, an array when there's more).",
            initCollapsed: true,
          },
          fields: [
            { name: 'name', type: 'text', required: true },
            {
              name: 'title',
              type: 'text',
              label: 'Title (optional)',
              admin: {
                description: 'e.g. "Co-Founder & CEO" — populates this founder\'s jobTitle in schema.org.',
              },
            },
          ],
        },
        {
          name: 'slogan',
          type: 'text',
        },
        {
          type: 'group',
          name: 'address',
          label: 'Address',
          admin: {
            description: 'Populates schema.org address (PostalAddress). Leave blank to omit.',
          },
          fields: [
            { name: 'streetAddress', type: 'text' },
            { name: 'addressLocality', type: 'text', label: 'City' },
            { name: 'addressRegion', type: 'text', label: 'State' },
            { name: 'postalCode', type: 'text' },
            { name: 'addressCountry', type: 'text', label: 'Country', defaultValue: 'IN' },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Educational Organization Details',
      admin: {
        initCollapsed: true,
        description:
          'eSaral is an ed-tech / test-prep company, so its JSON-LD is marked up as an EducationalOrganization (a schema.org subtype of Organization) by default rather than a plain Organization.',
      },
      fields: [
        {
          name: 'organizationType',
          type: 'select',
          defaultValue: 'EducationalOrganization',
          options: [
            { label: 'Educational Organization', value: 'EducationalOrganization' },
            { label: 'Organization (generic)', value: 'Organization' },
          ],
          admin: {
            description:
              'Controls the @type emitted for this Organization in JSON-LD (Article publisher / Course provider).',
          },
        },
        {
          name: 'knowsAbout',
          type: 'array',
          label: 'Subjects / Exams Covered',
          admin: {
            description:
              'Topics eSaral is known for (e.g. JEE, NEET, Physics, Chemistry, Maths, Biology) — populates schema.org knowsAbout, a GEO/E-E-A-T signal for AI answer engines.',
            initCollapsed: true,
          },
          fields: [{ name: 'topic', type: 'text', required: true }],
        },
      ],
    },
  ],
}
