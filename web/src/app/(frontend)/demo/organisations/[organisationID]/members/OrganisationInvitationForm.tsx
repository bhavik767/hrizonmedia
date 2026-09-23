'use client'

import { useActionState } from 'react'

import { inviteOrganisationMember, type OrganisationInvitationState } from '../../../actions'

const initialState: OrganisationInvitationState = {}

export function OrganisationInvitationForm({ organisationID }: { organisationID: number }) {
  const [state, action, pending] = useActionState(inviteOrganisationMember, initialState)

  return (
    <form action={action} className="member-form">
      <input name="organisationID" type="hidden" value={organisationID} />
      <label htmlFor="organisation-role">Organisation role</label>
      <select defaultValue="viewer" id="organisation-role" name="role">
        <option value="administrator">Organisation Administrator</option>
        <option value="publisher">Organisation Publisher</option>
        <option value="viewer">Organisation Viewer</option>
      </select>
      <button className="primary-action" disabled={pending} type="submit">
        {pending ? 'Creatingâ€¦' : 'Create invitation link'}
      </button>
      {state.error && (
        <p className="form-message form-message--error" role="alert">
          {state.error}
        </p>
      )}
      {state.invitationURL && (
        <p className="form-message form-message--success">
          Copy this one-time link (expires in seven days):{' '}
          <a data-testid="organisation-invitation-link" href={state.invitationURL}>
            {state.invitationURL}
          </a>
        </p>
      )}
    </form>
  )
}
