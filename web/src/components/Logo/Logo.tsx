import Image from 'next/image'
import React from 'react'

interface Props {
  className?: string
  compact?: boolean
}

export const Logo = (props: Props) => {
  const { className, compact = false } = props

  return (
    <span
      className={['brand-lockup', compact ? 'brand-lockup--compact' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Image
        alt=""
        className={compact ? 'brand-mark' : 'brand-lockup__artwork'}
        height={compact ? 56 : 30}
        src={compact ? '/favicon.svg' : '/brand-lockup.svg'}
        width={compact ? 56 : 190}
      />
    </span>
  )
}
