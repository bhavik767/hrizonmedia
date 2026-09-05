import clsx from 'clsx'
import React from 'react'

/**
 * The original key/play symbol is preserved as supplied artwork. The new
 * hrizonmedia wordmark is typeset beside it so the name stays sharp, searchable,
 * and correctly announced at every size.
 */

type LogoKind = 'lockup' | 'mark'

interface Props {
  className?: string
  kind?: LogoKind
  loading?: 'lazy' | 'eager'
  priority?: 'auto' | 'high' | 'low'
}

const mark = {
  dark: '/brand/logo-mark.png',
  height: 233,
  light: '/brand/logo-mark-black.png',
  width: 140,
}

export const Logo = (props: Props) => {
  const { className, kind = 'lockup', loading: loadingFromProps, priority: priorityFromProps } = props

  const loading = loadingFromProps || 'lazy'
  const priority = priorityFromProps || 'low'
  const imageClassName = 'h-auto shrink-0'

  if (kind === 'lockup') {
    return (
      <span
        aria-label="hrizonmedia"
        className={clsx(
          'inline-flex w-[140px] items-center gap-[7px] text-[#08080B] md:w-[160px] md:gap-2 dark:text-white',
          className,
        )}
      >
        <span aria-hidden="true" className="relative block w-[24px] shrink-0 md:w-[27px]">
          <img
            alt=""
            className={clsx(imageClassName, 'w-full dark:hidden')}
            decoding="async"
            fetchPriority={priority}
            height={mark.height}
            loading={loading}
            src={mark.light}
            width={mark.width}
          />
          <img
            alt=""
            className={clsx(imageClassName, 'hidden w-full dark:block')}
            decoding="async"
            fetchPriority={priority}
            height={mark.height}
            loading={loading}
            src={mark.dark}
            width={mark.width}
          />
        </span>
        <span className="[font-family:var(--font-display)] whitespace-nowrap text-[18px] font-extrabold leading-none tracking-[-0.045em] md:text-[21px]">
          hrizonmedia
        </span>
      </span>
    )
  }

  const shared = clsx('h-auto w-8 max-w-full', className)

  return (
    /* eslint-disable @next/next/no-img-element */
    <>
      <img
        alt="hrizonmedia"
        className={clsx(shared, 'dark:hidden')}
        decoding="async"
        fetchPriority={priority}
        height={mark.height}
        loading={loading}
        src={mark.light}
        width={mark.width}
      />
      <img
        alt="hrizonmedia"
        className={clsx(shared, 'hidden dark:block')}
        decoding="async"
        fetchPriority={priority}
        height={mark.height}
        loading={loading}
        src={mark.dark}
        width={mark.width}
      />
    </>
  )
}
