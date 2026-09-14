'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function RetryProcessingButton({ mediaAssetId }: { mediaAssetId: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    setError('')
    setRetrying(true)
    try {
      const response = await fetch(`/api/demo/assets/${mediaAssetId}/retry`, { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json()) as { error?: string }
        throw new Error(body.error || 'Unable to retry processing.')
      }
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to retry processing.')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div>
      <button
        className="primary-action"
        disabled={retrying}
        onClick={() => void retry()}
        type="button"
      >
        {retrying ? 'Retrying…' : 'Retry processing'}
      </button>
      {error && (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
