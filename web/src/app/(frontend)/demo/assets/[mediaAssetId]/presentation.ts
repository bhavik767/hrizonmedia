/** Stable presentation values for deferred Media Asset features. Never persist these as asset data. */
export const mediaAssetPresentation = {
  analyticsPeriod: 'Last 30 days',
  analytics: [
    { label: 'Total Views', value: '48,290', detail: '+18.4% vs previous month' },
    { label: 'Watch Time', value: '34,120 hrs', detail: '94% active viewer rate' },
    { label: 'Bandwidth Used', value: '1.84 TB', detail: '96.8% edge cache hit' },
    { label: 'Average Watch Duration', value: '41m 18s', detail: '78% completion rate' },
  ],
  allowedDomains: 'example.com, video.example.com',
  subtitleLanguages: 'English, Hindi',
  tag: 'Featured',
  totalStorage: '4.12 GB',
  renditionSizes: {
    360: '100 MB',
    480: '240 MB',
    720: '460 MB',
    1080: '920 MB',
  } as Record<number, string>,
  unavailableSize: '—',
} as const
