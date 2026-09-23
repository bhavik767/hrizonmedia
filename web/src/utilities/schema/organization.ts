import type { Organization as OrganizationGlobal } from '@/payload-types'

import { getServerSideURL } from '../getURL'
import { resolveMediaUrl } from './resolveMediaUrl'

// The Organization global's `publisher`/`provider` shape, shared by Article and Course schema.
// See adrs/adr-012-structured-data-implementation.md.
export function getOrganizationSchema(org: OrganizationGlobal | null | undefined) {
  if (!org) return null

  const logo = resolveMediaUrl(org.logo)

  const address = org.address
  const hasAddress =
    address &&
    (address.streetAddress ||
      address.addressLocality ||
      address.addressRegion ||
      address.postalCode ||
      address.addressCountry)

  const knowsAbout = org.knowsAbout
    ?.map((entry) => entry.topic)
    .filter((topic): topic is string => Boolean(topic))

  const founders =
    org.founders
      ?.filter((entry) => entry.name)
      .map((entry) => ({
        '@type': 'Person',
        name: entry.name as string,
        ...(entry.title ? { jobTitle: entry.title } : {}),
      })) ?? []

  return {
    '@type': org.organizationType || 'Organization',
    name: org.name || 'WeCloud',
    url: org.url || getServerSideURL(),
    ...(logo ? { logo } : {}),
    ...(org.sameAs && org.sameAs.length > 0
      ? { sameAs: org.sameAs.map((entry) => entry.url).filter(Boolean) }
      : {}),
    ...(org.description ? { description: org.description } : {}),
    ...(org.legalName ? { legalName: org.legalName } : {}),
    ...(org.alternateName ? { alternateName: org.alternateName } : {}),
    ...(org.email ? { email: org.email } : {}),
    ...(org.telephone ? { telephone: org.telephone } : {}),
    ...(org.foundingDate ? { foundingDate: org.foundingDate.slice(0, 10) } : {}),
    ...(founders.length > 0 ? { founder: founders.length === 1 ? founders[0] : founders } : {}),
    ...(org.slogan ? { slogan: org.slogan } : {}),
    ...(hasAddress
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(address.streetAddress ? { streetAddress: address.streetAddress } : {}),
            ...(address.addressLocality ? { addressLocality: address.addressLocality } : {}),
            ...(address.addressRegion ? { addressRegion: address.addressRegion } : {}),
            ...(address.postalCode ? { postalCode: address.postalCode } : {}),
            ...(address.addressCountry ? { addressCountry: address.addressCountry } : {}),
          },
        }
      : {}),
    ...(knowsAbout && knowsAbout.length > 0 ? { knowsAbout } : {}),
  }
}
