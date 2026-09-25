'use client'

import { useActionState } from 'react'

import {
  grantViewerMediaAccess,
  revokeViewerMediaAccess,
  type MediaAccessState,
} from '../../actions'

const initialState: MediaAccessState = {}

export function MediaAccessControls({
  mediaAssetId,
  viewers,
}: {
  mediaAssetId: string
  viewers: Array<{ access: 'active' | 'revoked' | 'none'; membershipID: number; name: string }>
}) {
  const [grantState, grantAction, granting] = useActionState(grantViewerMediaAccess, initialState)
  const [revokeState, revokeAction, revoking] = useActionState(
    revokeViewerMediaAccess,
    initialState,
  )

  if (viewers.length === 0) return null

  return (
    <section aria-labelledby="media-access-title" className="processing-failure">
      <h2 id="media-access-title">Viewer access</h2>
      <ul>
        {viewers.map((viewer) => (
          <li key={viewer.membershipID}>
            {viewer.name}{' '}
            {viewer.access === 'active' ? (
              <form action={revokeAction} className="inline-form">
                <input name="mediaAssetId" type="hidden" value={mediaAssetId} />
                <input name="membershipID" type="hidden" value={viewer.membershipID} />
                <button className="text-button" disabled={revoking} type="submit">
                  Revoke access
                </button>
              </form>
            ) : (
              <form action={grantAction} className="inline-form">
                <input name="mediaAssetId" type="hidden" value={mediaAssetId} />
                <input name="membershipID" type="hidden" value={viewer.membershipID} />
                <button className="text-button" disabled={granting} type="submit">
                  Grant access
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {(grantState.error || revokeState.error) && (
        <p className="form-message form-message--error" role="alert">
          {grantState.error || revokeState.error}
        </p>
      )}
      {(grantState.success || revokeState.success) && (
        <p className="form-message form-message--success">
          {grantState.success || revokeState.success}
        </p>
      )}
    </section>
  )
}
