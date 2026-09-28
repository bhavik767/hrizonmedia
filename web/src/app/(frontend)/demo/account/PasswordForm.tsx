'use client'

import { useActionState, useEffect, useRef } from 'react'

import { changePasswordAction, type ChangePasswordState } from './actions'

const initialState: ChangePasswordState = {}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state])

  return (
    <form action={formAction} className="member-form" ref={formRef}>
      <label htmlFor="current-password">Current password</label>
      <input
        autoComplete="current-password"
        id="current-password"
        name="currentPassword"
        required
        type="password"
      />
      <label htmlFor="new-password">New password</label>
      <input
        autoComplete="new-password"
        id="new-password"
        minLength={8}
        name="newPassword"
        required
        type="password"
      />
      <label htmlFor="confirm-password">Confirm new password</label>
      <input
        autoComplete="new-password"
        id="confirm-password"
        minLength={8}
        name="confirmPassword"
        required
        type="password"
      />
      <button className="primary-action" disabled={pending} type="submit">
        {pending ? 'Changing password…' : 'Change password'}
      </button>
      {state.error && (
        <p className="form-message form-message--error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="form-message form-message--success" role="status">
          {state.success}
        </p>
      )}
    </form>
  )
}
