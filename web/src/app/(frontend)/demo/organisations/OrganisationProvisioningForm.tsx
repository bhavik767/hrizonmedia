'use client'

import { useActionState } from 'react'

import { provisionOrganisation, type OrganisationProvisioningState } from '../actions'

const initialState: OrganisationProvisioningState = {}

export function OrganisationProvisioningForm({
  members,
}: {
  members: { id: number; name: string }[]
}) {
  const [state, action, pending] = useActionState(provisionOrganisation, initialState)

  return (
    <form action={action} className="member-form">
      <label htmlFor="organisation-name">Organisation name</label>
      <input id="organisation-name" name="name" required type="text" />
      <label htmlFor="initial-organisation-administrator">Initial Organisation Administrator</label>
      <select id="initial-organisation-administrator" name="initialAdministratorID" required>
        <option value="">Choose a Member</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <button className="primary-action" disabled={pending} type="submit">
        {pending ? 'Creating…' : 'Create Organisation'}
      </button>
      {state.error && (
        <p className="form-message form-message--error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && <p className="form-message form-message--success">{state.success}</p>}
    </form>
  )
}
