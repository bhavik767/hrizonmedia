'use client'

import { useActionState } from 'react'

import { appointPlatformAdministrator, type PlatformAdministratorState } from '../actions'

const initialState: PlatformAdministratorState = {}

export function PlatformAdministratorForm({
  members,
}: {
  members: { id: number; name: string }[]
}) {
  const [state, action, pending] = useActionState(appointPlatformAdministrator, initialState)

  return (
    <form action={action} className="member-form">
      <label htmlFor="platform-administrator-member">Member to appoint</label>
      <select id="platform-administrator-member" name="memberID" required>
        <option value="">Choose a Member</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <button className="secondary-action" disabled={pending} type="submit">
        {pending ? 'Granting…' : 'Grant Platform Administrator access'}
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
