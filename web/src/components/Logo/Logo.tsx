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
      <svg aria-hidden="true" className="brand-mark" viewBox="0 0 140 233">
        <circle cx="69" cy="69" fill="#f3c30c" r="57" />
        <path d="M47 36v67l58-34-58-33Z" fill="#08080b" />
        <path d="m51 116 18-10v111l-18-13v-88Zm20-10 14 10v38h18v17H85v18h28v18H85l-14 10V106Z" fill="#f3c30c" />
      </svg>
      {!compact && <span className="brand-wordmark">HrizonMedia</span>}
    </span>
  )
}
