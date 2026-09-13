import type { GlobalConfig } from 'payload'

// Placeholders for third-party analytics, advertising-pixel and site-verification IDs.
// Marketing/admins fill these in here; the frontend reads this global and injects the
// corresponding scripts/meta tags — no code changes needed to rotate or add an ID.
export const Integrations: GlobalConfig = {
  slug: 'integrations',
  label: 'Integrations',
  admin: {
    group: 'Site',
    description:
      'Third-party analytics, advertising-pixel and site-verification IDs, used to render tracking scripts and verification tags on the frontend.',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Core',
          description:
            'The tools already scoped for launch (see requirements.md §7) plus Bing/Microsoft verification.',
          fields: [
            {
              type: 'group',
              name: 'googleTagManager',
              label: 'Google Tag Manager',
              admin: {
                description:
                  'GTM container ID, from Google Tag Manager → Admin → Container Settings. Lets marketing manage additional tags without code changes.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'containerId',
                      type: 'text',
                      label: 'Container ID',
                      admin: { width: '70%', placeholder: 'GTM-XXXXXXX' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'group',
              name: 'googleAnalytics',
              label: 'Google Analytics (GA4)',
              admin: {
                description: 'GA4 Measurement ID, from Admin → Data Streams → your web stream.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'measurementId',
                      type: 'text',
                      label: 'Measurement ID',
                      admin: { width: '70%', placeholder: 'G-XXXXXXXXXX' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'group',
              name: 'metaPixel',
              label: 'Meta (Facebook) Pixel',
              admin: {
                description:
                  'From Meta Events Manager → Data Sources → your pixel. Used to track paid Meta campaign conversions.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'pixelId',
                      type: 'text',
                      label: 'Pixel ID',
                      admin: { width: '70%', placeholder: '123456789012345' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'group',
              name: 'googleSearchConsole',
              label: 'Google Search Console',
              admin: {
                description:
                  'Settings → Ownership verification → HTML tag method → paste only the content="..." value, not the whole tag. Critical for catching indexing/ranking regressions during the SEO migration.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'verificationCode',
                      type: 'text',
                      label: 'HTML Tag Verification Code',
                      admin: { width: '70%', placeholder: 'abc123XYZ...' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'group',
              name: 'microsoftWebmaster',
              label: 'Microsoft / Bing Webmaster Tools',
              admin: {
                description:
                  'Bing Webmaster Tools → Verify ownership → Option 2: Meta tag → paste only the content="..." value.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'verificationCode',
                      type: 'text',
                      label: 'Meta Tag Verification Code',
                      admin: { width: '70%', placeholder: 'abc123XYZ...' },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Additional',
          description:
            'Common industry-standard tools not yet scoped, pre-wired so adding one later is a config fill-in, not a code change.',
          fields: [
            {
              type: 'group',
              name: 'googleAds',
              label: 'Google Ads',
              admin: {
                description: 'Conversion ID, from Google Ads → Tools → Conversions.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'conversionId',
                      type: 'text',
                      label: 'Conversion ID',
                      admin: { width: '70%', placeholder: 'AW-XXXXXXXXX' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'group',
              name: 'linkedInInsightTag',
              label: 'LinkedIn Insight Tag',
              admin: {
                description: 'Partner ID, from Campaign Manager → Account Assets → Insight Tag.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'partnerId',
                      type: 'text',
                      label: 'Partner ID',
                      admin: { width: '70%', placeholder: '1234567' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'group',
              name: 'microsoftClarity',
              label: 'Microsoft Clarity',
              admin: {
                description: 'Project ID, from clarity.microsoft.com → Settings → Setup.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'projectId',
                      type: 'text',
                      label: 'Project ID',
                      admin: { width: '70%', placeholder: 'abcd1234ef' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'group',
              name: 'hotjar',
              label: 'Hotjar',
              admin: {
                description: 'Site ID, from Hotjar → Organization Settings → Sites & Organizations.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'siteId',
                      type: 'text',
                      label: 'Site ID',
                      admin: { width: '70%', placeholder: '1234567' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'group',
              name: 'tiktokPixel',
              label: 'TikTok Pixel',
              admin: {
                description: 'Pixel ID, from TikTok Ads Manager → Assets → Events.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'pixelId',
                      type: 'text',
                      label: 'Pixel ID',
                      admin: { width: '70%', placeholder: 'CXXXXXXXXXXXXXXXXXXX' },
                    },
                  ],
                },
              ],
            },
            {
              type: 'group',
              name: 'pinterestTag',
              label: 'Pinterest Tag',
              admin: {
                description: 'Tag ID, from Pinterest Ads Manager → Conversions → Pinterest tag.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'enabled',
                      type: 'checkbox',
                      label: 'Enabled',
                      defaultValue: false,
                      admin: { width: '30%' },
                    },
                    {
                      name: 'tagId',
                      type: 'text',
                      label: 'Tag ID',
                      admin: { width: '70%', placeholder: '1234567890123' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'customVerificationTags',
              type: 'array',
              label: 'Other Verification Tags',
              admin: {
                initCollapsed: true,
                description:
                  'For any other site-verification meta tag (Yandex Webmaster, Pinterest domain verification, Naver, etc.) not covered above.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'provider',
                      type: 'text',
                      label: 'Provider / Tool Name',
                      required: true,
                      admin: { width: '40%', placeholder: 'Yandex Webmaster' },
                    },
                    {
                      name: 'content',
                      type: 'text',
                      label: 'Meta Tag Content Value',
                      required: true,
                      admin: { width: '60%' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
