import type { PayloadRequest } from 'payload'

import { PREFERENCE_KEYS } from 'payload/shared'

type NavPreferences = {
  groups?: Record<string, { open?: boolean }>
} | null

/**
 * Re-implements @payloadcms/next's internal `getNavPrefs` helper (it isn't part of that
 * package's public API, so it can't be imported directly) so AdminNav can read the same
 * per-user, per-group open/collapsed state that Payload's `NavGroup` writes to whenever a user
 * toggles a group.
 */
export const getNavPrefs = async (req: PayloadRequest): Promise<NavPreferences> => {
  if (!req?.user?.collection) {
    return null
  }

  const result = await req.payload.find({
    collection: 'payload-preferences',
    depth: 0,
    limit: 1,
    pagination: false,
    req,
    where: {
      and: [
        { key: { equals: PREFERENCE_KEYS.NAV } },
        { 'user.relationTo': { equals: req.user.collection } },
        { 'user.value': { equals: req.user.id } },
      ],
    },
  })

  return (result?.docs?.[0]?.value as NavPreferences) ?? null
}
