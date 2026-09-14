'use client'

import { useActionState } from 'react'

import { invitePilotMember, type InviteMemberState } from '../actions'

const initialState: InviteMemberState = {}

export function InviteMemberForm() {
  const [state, action, pending] = useActionState(invitePilotMember, initialState)

  return (
    <form action={action} className="pilot-form">
      <label htmlFor="member-name">Name</label>
      <input id="member-name" name="name" required type="text" />
      <label htmlFor="member-email">Email</label>
      <input id="member-email" name="email" required type="email" />
      <label htmlFor="member-role">Role</label>
      <select defaultValue="uploader" id="member-role" name="role">
        <option value="uploader">Uploader</option>
        <option value="operator">Operator</option>
      </select>
      <button className="primary-action" disabled={pending} type="submit">
        {pending ? 'Creating…' : 'Create setup link'}
      </button>
      {state.error && (
        <p className="form-message form-message--error" role="alert">
          {state.error}
        </p>
      )}
      {state.setupUrl && (
        <p className="form-message form-message--success">
          Single-use setup link (expires in 24 hours):{' '}
          <a data-testid="setup-link" href={state.setupUrl}>
            {state.setupUrl}
          </a>
        </p>
      )}
    </form>
  )
}
