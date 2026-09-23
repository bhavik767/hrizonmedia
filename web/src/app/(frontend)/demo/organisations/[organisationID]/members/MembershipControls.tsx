'use client'

import { useActionState } from 'react'

import {
  disableOrganisationMember,
  removeOrganisationMember,
  type OrganisationMembershipState,
} from '../../../actions'

const initialState: OrganisationMembershipState = {}

export function MembershipControls({
  membershipID,
  organisationID,
}: {
  membershipID: number
  organisationID: number
}) {
  const [disableState, disableAction, disabling] = useActionState(
    disableOrganisationMember,
    initialState,
  )
  const [removeState, removeAction, removing] = useActionState(removeOrganisationMember, initialState)

  return (
    <div className="demo-actions">
      <form action={disableAction}>
        <input name="organisationID" type="hidden" value={organisationID} />
        <input name="membershipID" type="hidden" value={membershipID} />
        <button className="text-button" disabled={disabling} type="submit">
          Disable
        </button>
      </form>
      <form action={removeAction}>
        <input name="organisationID" type="hidden" value={organisationID} />
        <input name="membershipID" type="hidden" value={membershipID} />
        <button className="text-button" disabled={removing} type="submit">
          Remove
        </button>
      </form>
      {(disableState.error || removeState.error) && (
        <p className="form-message form-message--error" role="alert">
          {disableState.error || removeState.error}
        </p>
      )}
      {(disableState.success || removeState.success) && (
        <p className="form-message form-message--success">
          {disableState.success || removeState.success}
        </p>
      )}
    </div>
  )
}
