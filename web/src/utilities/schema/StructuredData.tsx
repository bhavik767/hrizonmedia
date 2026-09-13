import React from 'react'

// Renders a JSON-LD @graph as a <script type="application/ld+json"> tag. Placed directly in
// the page component's JSX (not next/script), which is the standard pattern for JSON-LD in the
// Next.js App Router.
export const StructuredData: React.FC<{ schema: Record<string, unknown> }> = ({ schema }) => {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
