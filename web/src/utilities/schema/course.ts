import type { Organization as OrganizationGlobal, Page } from '@/payload-types'

import { getOrganizationSchema } from './organization'

// Course schema — Landing Pages only, manually authored (no equivalent visible block/content
// to derive it from, unlike FAQPage/HowTo/Video). `provider` always comes from the
// Organization global, never re-entered per page.
// The field list beyond name/description is still open — see open-questions.md item 8.
// See adrs/adr-012-structured-data-implementation.md.
export function getCourseSchema({
  page,
  organization,
}: {
  page: Page
  organization: OrganizationGlobal | null | undefined
}) {
  const course = page.courseSchema
  if (!course?.name || !course?.description) return null

  const provider = getOrganizationSchema(organization)

  return {
    '@type': 'Course',
    name: course.name,
    description: course.description,
    ...(provider ? { provider } : {}),
    ...(course.courseMode || course.educationalLevel
      ? {
          hasCourseInstance: {
            '@type': 'CourseInstance',
            ...(course.courseMode ? { courseMode: course.courseMode } : {}),
          },
        }
      : {}),
    ...(course.educationalLevel ? { educationalLevel: course.educationalLevel } : {}),
    ...(course.coursePrerequisites ? { coursePrerequisites: course.coursePrerequisites } : {}),
    ...(course.hasOffer && course.price
      ? {
          offers: {
            '@type': 'Offer',
            price: course.price,
            priceCurrency: course.priceCurrency || 'INR',
          },
        }
      : {}),
  }
}
