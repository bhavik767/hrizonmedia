import React from 'react'

/**
 * The footer's place for the site's single ask.
 *
 * The capture itself — its form, its copy and its states — is built in the
 * email capture slice. Until then this reserves the position and renders
 * nothing: a placeholder form would take a reader's address and drop it, which
 * is a worse thing to ship than an empty corner.
 */
export const EmailCaptureSlot: React.FC = () => (
  <div className="md:w-[22rem]" data-email-capture-slot />
)
