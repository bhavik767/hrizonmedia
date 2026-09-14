'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function DeleteAssetButton({ mediaAssetId }: { mediaAssetId: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function deleteAsset() {
    if (!window.confirm('Delete this Media Asset? Playback will stop immediately.')) return
    setError('')
    setPending(true)
    const response = await fetch(`/api/demo/assets/${mediaAssetId}`, { method: 'DELETE' })
    if (response.ok) {
      router.push('/demo')
      router.refresh()
      return
    }
    const body = (await response.json()) as { error?: string }
    setError(body.error || 'Unable to delete this Media Asset.')
    setPending(false)
  }

  return (
    <div>
      <button
        className="text-button"
        disabled={pending}
        onClick={() => void deleteAsset()}
        type="button"
      >
        {pending ? 'Deleting…' : 'Delete asset'}
      </button>
      {error && (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
