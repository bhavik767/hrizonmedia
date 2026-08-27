import clsx from 'clsx'
import React from 'react'

/**
 * The mark is artwork, never re-typed: the brand book bars setting
 * "EncryptStream" in a typeface, so both variants below are the supplied files
 * served from this site rather than a remote or a re-drawn SVG.
 *
 * Both variants are always in the document and one is hidden by CSS, so the
 * correct artwork is painted with the first frame. Choosing in JavaScript would
 * flash the wrong lockup on every load, and a hidden image is out of the
 * accessibility tree, so the link still announces one name.
 */

type LogoKind = 'lockup' | 'mark'

interface Props {
  className?: string
  kind?: LogoKind
  loading?: 'lazy' | 'eager'
  priority?: 'auto' | 'high' | 'low'
}

const artwork: Record<LogoKind, { dark: string; height: number; light: string; width: number }> = {
  /* Primary on a dark ground, mono black on a light one. Full colour is the
   * default; mono is reached for only where the ground rules out the yellow. */
  lockup: {
    dark: '/brand/logo-lockup.png',
    height: 240,
    light: '/brand/logo-lockup-black.png',
    width: 740,
  },
  mark: {
    dark: '/brand/logo-mark.png',
    height: 233,
    light: '/brand/logo-mark-black.png',
    width: 140,
  },
}

export const Logo = (props: Props) => {
  const { className, kind = 'lockup', loading: loadingFromProps, priority: priorityFromProps } = props

  const loading = loadingFromProps || 'lazy'
  const priority = priorityFromProps || 'low'
  const { dark, height, light, width } = artwork[kind]

  /* Never below the brand book's minimum: 140px for the lockup, 24px for the
   * mark. Under those the teeth on the key shaft fill in and it stops reading. */
  const size = kind === 'lockup' ? 'w-[140px] md:w-[160px]' : 'w-8'

  const shared = clsx('h-auto max-w-full', size, className)

  return (
    /* eslint-disable @next/next/no-img-element */
    <>
      <img
        alt="EncryptStream"
        className={clsx(shared, 'dark:hidden')}
        decoding="async"
        fetchPriority={priority}
        height={height}
        loading={loading}
        src={light}
        width={width}
      />
      <img
        alt="EncryptStream"
        className={clsx(shared, 'hidden dark:block')}
        decoding="async"
        fetchPriority={priority}
        height={height}
        loading={loading}
        src={dark}
        width={width}
      />
    </>
  )
}
