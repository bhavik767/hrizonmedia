'use client'

import { getTranslation } from '@payloadcms/translations'
import { BrowseByFolderButton, Link, NavGroup, useConfig, useTranslation } from '@payloadcms/ui'
import { EntityType } from '@payloadcms/ui/shared'
import { usePathname } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'
import React, { Fragment } from 'react'

import { DefaultNavIcon, navIcons } from './navIcons'

const baseClass = 'nav'

type NavPreferences = {
  groups?: Record<string, { open?: boolean }>
} | null

type NavGroupEntity = {
  label: unknown
  slug: string
  type: string
}

type NavGroupData = {
  entities: NavGroupEntity[]
  label: string
}

type Props = {
  groups: NavGroupData[]
  navPreferences: NavPreferences
}

/**
 * Re-implements @payloadcms/next's internal `DefaultNavClient` (it isn't part of that package's
 * public API, so it can't be imported/wrapped directly) with two changes on top of stock Payload
 * behavior:
 *  - an icon (from `navIcons`) in front of every collection/global link
 *  - every group defaults to collapsed the first time a user opens the admin panel, instead of
 *    Payload's stock "open by default" — once a user toggles a group, `NavGroup` persists that
 *    choice via preferences as usual and this component keeps honoring it
 */
export const NavClient: React.FC<Props> = ({ groups, navPreferences }) => {
  const pathname = usePathname()
  const { config } = useConfig()
  const { i18n } = useTranslation()

  const {
    admin: {
      routes: { browseByFolder: foldersRoute },
    },
    folders,
    routes: { admin: adminRoute },
  } = config

  const folderURL = formatAdminURL({ adminRoute, path: foldersRoute })
  const viewingRootFolderView = pathname.startsWith(folderURL)

  return (
    <Fragment>
      {folders && folders.browseByFolder && (
        <BrowseByFolderButton active={viewingRootFolderView} />
      )}
      {groups.map(({ entities, label }, key) => (
        <NavGroup isOpen={navPreferences?.groups?.[label]?.open ?? false} key={key} label={label}>
          {entities.map(({ slug, type, label: entityLabel }, i) => {
            let href = ''
            let id = ''

            if (type === EntityType.collection) {
              href = formatAdminURL({ adminRoute, path: `/collections/${slug}` })
              id = `nav-${slug}`
            }

            if (type === EntityType.global) {
              href = formatAdminURL({ adminRoute, path: `/globals/${slug}` })
              id = `nav-global-${slug}`
            }

            const isActive =
              pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])

            const Icon = navIcons[slug] ?? DefaultNavIcon

            const linkContent = (
              <Fragment>
                {isActive && <div className={`${baseClass}__link-indicator`} />}
                <Icon className={`${baseClass}__link-icon`} size={16} strokeWidth={1.75} />
                <span className={`${baseClass}__link-label`}>
                  {getTranslation(entityLabel as never, i18n)}
                </span>
              </Fragment>
            )

            if (pathname === href) {
              return (
                <div className={`${baseClass}__link`} id={id} key={i}>
                  {linkContent}
                </div>
              )
            }

            return (
              <Link className={`${baseClass}__link`} href={href} id={id} key={i} prefetch={false}>
                {linkContent}
              </Link>
            )
          })}
        </NavGroup>
      ))}
    </Fragment>
  )
}
