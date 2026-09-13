import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { Archive } from '../../blocks/ArchiveBlock/config'
import { CallToAction } from '../../blocks/CallToAction/config'
import { YouTubeVideo } from '../../blocks/YouTubeVideo/config'
import { Carousel } from '../../blocks/Carousel/config'
import { Content } from '../../blocks/Content/config'
import { FormBlock } from '../../blocks/Form/config'
import { GlobalCarousel } from '../../blocks/GlobalCarousel/config'
import { MediaBlock } from '../../blocks/MediaBlock/config'
import { hero } from '@/heros/config'
import { slugField } from 'payload'
import { populatePublishedAt } from '../../hooks/populatePublishedAt'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { revalidateDelete, revalidatePage } from './hooks/revalidatePage'
import { structuredDataField } from '../../fields/structuredData'
import { courseSchemaTab } from '../../fields/courseSchema'
import { faqTab } from '../../fields/faq'
import { focusKeywordField, seoAnalysisPanelField, seoScoreField } from '../../fields/seoAnalysis'
import { computeSeoScoreHook } from '../../utilities/seo/computeScoreHook'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

export const Pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  // This config controls what's populated by default when a page is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'pages'>
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    group: 'Content',
    defaultColumns: ['title', 'slug', 'meta.seoScore', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'pages',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'pages',
        req,
      }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [hero],
          label: 'Hero',
        },
        {
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: [
                CallToAction,
                Content,
                MediaBlock,
                Archive,
                FormBlock,
                Carousel,
                GlobalCarousel,
                YouTubeVideo,
              ],
              required: true,
              admin: {
                initCollapsed: true,
              },
            },
          ],
          label: 'Content',
        },
        faqTab,
        courseSchemaTab,
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            focusKeywordField(),
            seoAnalysisPanelField('pages'),
            seoScoreField(),
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            {
              name: 'canonical',
              type: 'text',
              label: 'Canonical URL',
              admin: {
                description:
                  "Defaults to this page's own URL (based on its slug). Enter a URL here to override it with a different canonical page instead.",
              },
            },
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'authors',
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      hasMany: true,
      relationTo: 'authors',
    },
    structuredDataField(),
    slugField(),
  ],
  hooks: {
    afterChange: [revalidatePage],
    beforeChange: [populatePublishedAt, computeSeoScoreHook('pages')],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      // No autosave: saves should only happen when an editor explicitly clicks Save/Publish
      // (or a scheduled publish fires), not on every keystroke. Trade-off: this project's
      // frontend is server-rendered (RSC), so the Live Preview panel (LivePreviewListener /
      // RefreshRouteOnSave) only re-fetches on an actual save event — without autosave, it now
      // only updates on manual Save/Publish rather than continuously while typing.
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
