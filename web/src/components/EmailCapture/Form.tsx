'use client'

import React, { useCallback, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { earlyAccessCopy, earlyAccessForm } from '@/forms/earlyAccess'
import { getClientSideURL } from '@/utilities/getURL'
import { cn } from '@/utilities/ui'

type Status = 'idle' | 'invalid' | 'sending' | 'sent' | 'failed'

/**
 * Enough to catch a mistyped address before it is lost, and no more. A stricter
 * pattern rejects real addresses, and the only authority on whether an address
 * works is whether mail to it arrives — which is not a thing this site can find
 * out today.
 */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = {
  className?: string
  formId: number | string
}

/**
 * The site's single ask.
 *
 * Purpose-built rather than rendered through the generic form block, because it
 * appears in fixed positions with fixed copy and has to sit on the brand. It is
 * a client component because a reader who submits has to be told what happened
 * without leaving the Article they were reading.
 */
export const EmailCaptureForm: React.FC<Props> = ({ className, formId }) => {
  const id = useId()
  const headingId = `${id}-heading`
  const inputId = `${id}-email`
  const messageId = `${id}-message`

  const [address, setAddress] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      /*
       * Checked here rather than left to the browser's own validation, so the
       * reader is told what is wrong in the site's own words and in the site's
       * own colours, and so nothing leaves for the server that cannot succeed.
       */
      if (!ADDRESS.test(address.trim())) {
        setStatus('invalid')
        return
      }

      setStatus('sending')

      const send = async () => {
        try {
          const response = await fetch(`${getClientSideURL()}/api/form-submissions`, {
            body: JSON.stringify({
              form: formId,
              submissionData: [{ field: earlyAccessForm.fieldName, value: address.trim() }],
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          })

          setStatus(response.ok ? 'sent' : 'failed')
        } catch {
          setStatus('failed')
        }
      }

      void send()
    },
    [address, formId],
  )

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'not-prose rounded-plate border border-border bg-card px-6 py-6',
        className,
      )}
    >
      <h2 className="text-h3 mb-2" id={headingId}>
        {earlyAccessCopy.heading}
      </h2>

      <p className="mb-4 text-sm text-caption">{earlyAccessCopy.supporting}</p>

      {status === 'sent' ? (
        /*
         * The form goes when it has worked. A reader who is already on the list
         * and still looking at an empty box submits again or assumes it failed.
         */
        <p className="text-sm text-heading" id={messageId} role="status">
          {earlyAccessCopy.success}
        </p>
      ) : (
        <form noValidate onSubmit={onSubmit}>
          <label className="sr-only" htmlFor={inputId}>
            {earlyAccessForm.fieldLabel}
          </label>

          <div className="flex flex-col gap-3">
            <Input
              aria-describedby={status === 'idle' ? undefined : messageId}
              aria-invalid={status === 'invalid'}
              autoComplete="email"
              id={inputId}
              onChange={(event) => {
                setAddress(event.target.value)
                if (status !== 'idle') setStatus('idle')
              }}
              placeholder="you@example.com"
              type="email"
              value={address}
            />

            <Button disabled={status === 'sending'} type="submit">
              {earlyAccessCopy.button}
            </Button>
          </div>

          {status !== 'idle' && (
            <p
              className={cn(
                'mt-3 text-sm',
                status === 'invalid' || status === 'failed' ? 'text-destructive' : 'text-caption',
              )}
              id={messageId}
              role="status"
            >
              {status === 'invalid' && earlyAccessCopy.invalid}
              {status === 'sending' && earlyAccessCopy.sending}
              {status === 'failed' && earlyAccessCopy.failure}
            </p>
          )}
        </form>
      )}
    </section>
  )
}
