import { ImageResponse } from 'next/og'

export const alt = 'HrizonMedia — Plays where you allow it. Nowhere else.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#08080b',
        color: '#ffffff',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        padding: 84,
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, width: '100%' }}>
        <div style={{ color: '#f3c30c', display: 'flex', fontSize: 34, fontWeight: 700 }}>
          HrizonMedia
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 82, fontWeight: 800, letterSpacing: '-4px', lineHeight: 1 }}>
          <span>Plays where you allow it.</span>
          <span style={{ color: '#f3c30c' }}>Nowhere else.</span>
        </div>
        <div style={{ color: '#8c8c9a', display: 'flex', fontSize: 28 }}>
          Secure video. Precisely controlled.
        </div>
      </div>
    </div>,
    size,
  )
}
