import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardOverview } from '@/app/(frontend)/demo/DashboardOverview'
import { DashboardShell } from '@/app/(frontend)/demo/DashboardShell'
import { MediaLibrary } from '@/app/(frontend)/demo/MediaLibrary'

const uploadOrganisation = {
  defaultRetentionDays: 30,
  drmDefault: 'protected' as const,
  drmRequired: false,
  id: 7,
  maximumUploadSizeBytes: 2 * 1024 * 1024 * 1024,
  name: 'Demo Organisation',
}

describe('dashboard interaction regressions', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/demo/videos')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        return Response.json(url.includes('/folders') ? { folders: [] } : { assets: [] })
      }),
    )
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        media: '(min-width: 801px)',
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('fully hides and restores the dashboard navigation when the menu button is toggled', async () => {
    render(
      React.createElement(
        DashboardShell,
        { currentPath: '/demo' },
        React.createElement('main', null, 'Dashboard content'),
      ),
    )

    const closeButton = await screen.findByRole('button', { name: 'Close navigation' })
    const navigation = screen.getByRole('navigation', { name: 'Dashboard navigation' })

    fireEvent.click(closeButton)
    expect(navigation.hidden).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(navigation.hidden).toBe(false)
  })

  it('opens a backend-accurate upload dialog before choosing a file', async () => {
    render(
      React.createElement(MediaLibrary, {
        libraryOrganisations: [{ id: 7, name: 'Demo Organisation' }],
        uploadOrganisations: [uploadOrganisation],
      }),
    )

    const uploadButton = (await screen.findByRole('button', {
      name: 'Upload Video',
    })) as HTMLButtonElement
    await waitFor(() => expect(uploadButton.disabled).toBe(false))
    fireEvent.click(uploadButton)

    const dialog = screen.getByRole('dialog', { name: 'Upload Video' })
    expect(dialog.textContent).toContain('MP4 or MKV')
    expect(dialog.textContent).toContain('2.0 GB maximum')
    expect(dialog.textContent).not.toContain('MOV')
    expect(dialog.textContent).not.toContain('ProRes')
    const startButton = screen.getByRole('button', { name: 'Start Upload' })
    expect(startButton.hasAttribute('disabled')).toBe(true)

    fireEvent.change(document.querySelector('#video-file')!, {
      target: { files: [new File(['video'], 'lesson.mp4', { type: 'video/mp4' })] },
    })
    expect(startButton.hasAttribute('disabled')).toBe(false)
    expect(dialog.textContent).toContain('lesson.mp4')
  })

  it('opens the upload dialog when arriving from the dashboard action', async () => {
    const { unmount } = render(
      React.createElement(DashboardOverview, {
        administratorOrganisationID: null,
        memberEmail: 'publisher@example.com',
        memberName: 'Publisher',
        platformAdministration: false,
      }),
    )
    expect(screen.getByRole('link', { name: 'Upload Video' }).getAttribute('href')).toBe(
      '/demo/videos#upload',
    )
    unmount()

    window.history.replaceState({}, '', '/demo/videos#upload')
    render(
      React.createElement(MediaLibrary, {
        libraryOrganisations: [{ id: 7, name: 'Demo Organisation' }],
        uploadOrganisations: [uploadOrganisation],
      }),
    )

    expect(await screen.findByRole('dialog', { name: 'Upload Video' })).toBeTruthy()
  })
})
