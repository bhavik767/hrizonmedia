'use client'

import { GearIcon, Popup, useTranslation } from '@payloadcms/ui'
import React, { Fragment } from 'react'

const baseClass = 'settings-menu-button'

/**
 * Re-implements @payloadcms/next's internal `SettingsMenuButton` (it isn't part of that
 * package's public API, so it can't be imported directly), so any `admin.components.settingsMenu`
 * entries a plugin registers keep rendering here.
 */
export const NavSettingsMenuButton: React.FC<{ settingsMenu: React.ReactNode[] }> = ({
  settingsMenu,
}) => {
  const { t } = useTranslation()

  if (!settingsMenu || settingsMenu.length === 0) {
    return null
  }

  return (
    <Popup
      button={<GearIcon ariaLabel={t('general:menu')} />}
      className={baseClass}
      horizontalAlign="left"
      id="settings-menu"
      size="small"
      verticalAlign="bottom"
    >
      {settingsMenu.map((item, i) => (
        <Fragment key={`settings-menu-item-${i}`}>{item}</Fragment>
      ))}
    </Popup>
  )
}
