type Props = {
  action: (formData: FormData) => Promise<void>
  settings: {
    defaultRetentionDays: number
    drmDefault: 'protected' | 'standard'
    drmRequired?: boolean | null
    maximumUploadSizeBytes: number
  }
  submitLabel: string
}

export function SettingsForm({ action, settings, submitLabel }: Props) {
  return (
    <form action={action} className="member-form" encType="multipart/form-data">
      <label htmlFor="drm-default">Default Media Protection Policy</label>
      <select defaultValue={settings.drmDefault} id="drm-default" name="drmDefault">
        <option value="protected">DRM-protected playback</option>
        <option value="standard">Standard playback</option>
      </select>
      <label>
        <input defaultChecked={settings.drmRequired ?? false} name="drmRequired" type="checkbox" />
        {' '}Require DRM-protected playback for all future uploads
      </label>
      <label htmlFor="default-retention-days">Default Media Asset retention (days)</label>
      <input defaultValue={settings.defaultRetentionDays} id="default-retention-days" min="1" name="defaultRetentionDays" required type="number" />
      <label htmlFor="maximum-upload-size">Maximum future upload size (MB)</label>
      <input defaultValue={settings.maximumUploadSizeBytes / (1024 * 1024)} id="maximum-upload-size" max="2048" min="1" name="maximumUploadSizeMegabytes" required type="number" />
      <label htmlFor="organisation-logo">Organisation Logo (optional PNG, JPEG, or WebP; 3 MB maximum)</label>
      <input accept="image/png,image/jpeg,image/webp" id="organisation-logo" name="logo" type="file" />
      <button className="primary-action" type="submit">{submitLabel}</button>
    </form>
  )
}
