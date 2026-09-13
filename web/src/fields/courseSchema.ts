import type { Tab } from 'payload'

// Course schema (schema.org/Course) has no equivalent visible block/content to derive from —
// unlike FAQPage/HowTo/Video — so this is a dedicated, manually-filled field group. Only shown
// when `course` is checked in the Structured Data selector. `provider` is NOT a field here: it
// always comes from the Organization global at render time (adrs/adr-012-structured-data-implementation.md).
// The exact field list beyond name/description is still open — see open-questions.md item 8 —
// this is a reasonable starting set covering schema.org/Course's common optional properties.
export const courseSchemaTab: Tab = {
  name: 'courseSchema',
  label: 'Course',
  admin: {
    condition: (data) => Boolean(data?.structuredData?.includes?.('course')),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description:
          'Concise course name for schema.org/Course — doesn\'t have to match the page title exactly (e.g. "JEE Physics Test Series" rather than a full marketing headline).',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
    },
    {
      name: 'courseMode',
      type: 'select',
      label: 'Course Mode',
      options: [
        { label: 'Online', value: 'online' },
        { label: 'Onsite', value: 'onsite' },
        { label: 'Blended', value: 'blended' },
      ],
      admin: {
        description: 'Populates hasCourseInstance.courseMode, if set.',
      },
    },
    {
      name: 'educationalLevel',
      type: 'text',
      label: 'Educational Level',
      admin: {
        description: 'E.g. "Class 11-12", "JEE Aspirants". Optional.',
      },
    },
    {
      name: 'coursePrerequisites',
      type: 'text',
      label: 'Prerequisites',
      admin: {
        description: 'Optional. E.g. "Completion of Class 10".',
      },
    },
    {
      name: 'hasOffer',
      type: 'checkbox',
      label: 'Include Pricing (offers)',
    },
    {
      name: 'price',
      type: 'number',
      admin: {
        condition: (_, siblingData) => Boolean(siblingData?.hasOffer),
        description: 'Numeric price only, no currency symbol.',
      },
    },
    {
      name: 'priceCurrency',
      type: 'text',
      label: 'Price Currency (ISO 4217)',
      defaultValue: 'INR',
      admin: {
        condition: (_, siblingData) => Boolean(siblingData?.hasOffer),
      },
    },
  ],
}
