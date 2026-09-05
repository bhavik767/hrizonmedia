import React from 'react'

import { getSiteAuthor } from '@/utilities/getAuthor'

/**
 * Who is behind hrizonmedia, closing every Article.
 *
 * It is the same on all of them, so it reads as the company rather than as a
 * contributor note: a reader who has just been persuaded by an argument about
 * video piracy is deciding who they would be buying from.
 */
export async function AuthorBiography() {
  const { biography, name } = await getSiteAuthor()

  return (
    <section className="container pt-16">
      <div className="max-w-[65ch] rounded-plate border border-border bg-card p-6 md:p-8">
        <h2 className="text-h3 mb-3">Who is behind hrizonmedia</h2>

        <p className="mb-2 text-label uppercase tracking-[0.18em] text-caption">{name}</p>

        <p>{biography}</p>
      </div>
    </section>
  )
}
