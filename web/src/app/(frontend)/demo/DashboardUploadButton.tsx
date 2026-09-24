'use client'

/** Opens the real Media Library input within the original browser gesture. */
export function DashboardUploadButton() {
  return (
    <button
      className="primary-action"
      onClick={() => document.getElementById('video-file')?.click()}
      type="button"
    >
      Upload Video
    </button>
  )
}
