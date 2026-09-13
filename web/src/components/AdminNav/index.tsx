import { Logout } from '@payloadcms/ui'
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { EntityType, groupNavItems } from '@payloadcms/ui/shared'
import React from 'react'

import { getNavPrefs } from './getNavPrefs'
import { NavClient } from './NavClient'
import { NavHamburgerButton } from './NavHamburger'
import { NavSettingsMenuButton } from './NavSettingsMenuButton'
import { NavWrapper } from './NavWrapper'

const baseClass = 'nav'

/**
 * Custom replacement for Payload's built-in admin sidebar (wired up via `admin.components.Nav`
 * in payload.config.ts). @payloadcms/next's `DefaultNav` isn't part of that package's public
 * API, so this reimplements its structure — grouping, links, hamburger, settings menu, logout —
 * from Payload's public building blocks. The one meaningful behavior change lives in
 * `NavClient`: a per-item icon, and groups collapsed by default. See also `custom.scss` for the
 * bigger group-heading font that goes with this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AdminNav = async (props: any) => {
  const {
    documentSubViewType,
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
    viewType,
    visibleEntities,
  } = props

  if (!payload?.config) {
    return null
  }

  const {
    admin: {
      components: { afterNav, afterNavLinks, beforeNav, beforeNavLinks, logout, settingsMenu },
    },
    collections,
    globals,
  } = payload.config

  const groups = groupNavItems(
    [
      ...collections
        .filter(({ slug }: { slug: string }) => visibleEntities.collections.includes(slug))
        .map((collection: unknown) => ({ entity: collection, type: EntityType.collection })),
      ...globals
        .filter(({ slug }: { slug: string }) => visibleEntities.globals.includes(slug))
        .map((global: unknown) => ({ entity: global, type: EntityType.global })),
    ],
    permissions,
    i18n,
  )

  const navPreferences = await getNavPrefs(req)

  const serverProps = { i18n, locale, params, payload, permissions, searchParams, user }
  const clientProps = { documentSubViewType, viewType }

  const LogoutComponent = RenderServerComponent({
    clientProps,
    Component: logout?.Button,
    Fallback: Logout,
    importMap: payload.importMap,
    serverProps,
  })

  const RenderedSettingsMenu =
    settingsMenu && Array.isArray(settingsMenu)
      ? settingsMenu.map((item: unknown, index: number) =>
          RenderServerComponent({
            clientProps,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Component: item as any,
            importMap: payload.importMap,
            key: `settings-menu-item-${index}`,
            serverProps,
          }),
        )
      : []

  const RenderedBeforeNav = RenderServerComponent({
    clientProps,
    Component: beforeNav,
    importMap: payload.importMap,
    serverProps,
  })
  const RenderedBeforeNavLinks = RenderServerComponent({
    clientProps,
    Component: beforeNavLinks,
    importMap: payload.importMap,
    serverProps,
  })
  const RenderedAfterNavLinks = RenderServerComponent({
    clientProps,
    Component: afterNavLinks,
    importMap: payload.importMap,
    serverProps,
  })
  const RenderedAfterNav = RenderServerComponent({
    clientProps,
    Component: afterNav,
    importMap: payload.importMap,
    serverProps,
  })

  return (
    <NavWrapper>
      {RenderedBeforeNav}
      <nav className={`${baseClass}__wrap`}>
        {RenderedBeforeNavLinks}
        <NavClient groups={groups} navPreferences={navPreferences} />
        {RenderedAfterNavLinks}
        <div className={`${baseClass}__controls`}>
          <NavSettingsMenuButton settingsMenu={RenderedSettingsMenu} />
          {LogoutComponent}
        </div>
      </nav>
      {RenderedAfterNav}
      <div className={`${baseClass}__header`}>
        <div className={`${baseClass}__header-content`}>
          <NavHamburgerButton />
        </div>
      </div>
    </NavWrapper>
  )
}

export default AdminNav
