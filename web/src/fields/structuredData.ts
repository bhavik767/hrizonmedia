import type { Field } from 'payload'

// Landing-Pages-only: opts a page in to Course schema (its own manually-authored fields, shown
// in the Course tab — src/fields/courseSchema.ts — only when selected here). Every other
// schema type (Article/BlogPosting, BreadcrumbList, FAQ, Video) is always attempted directly
// from existing content, with no selector and no per-type opt-in — see
// adrs/adr-012-structured-data-implementation.md. Not used on Posts: Course is the only type
// that still needs an explicit flag (there's no post/page content that unambiguously signals
// "this should be marked up as a Course" the way an FAQ tab or a YouTube block does), and
// Course only applies to Landing Pages.
export const structuredDataField = (): Field => {
  return {
    name: 'structuredData',
    type: 'select',
    label: 'Structured Data',
    hasMany: true,
    admin: {
      position: 'sidebar',
      description:
        'Additional schema.org types to publish for this page (BreadcrumbList, FAQ, and Video are always on). Course reveals its own fields in the Course tab.',
    },
    options: [{ label: 'Course', value: 'course' }],
  }
}
