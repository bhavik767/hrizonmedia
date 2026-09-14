import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  disablePilotMember,
  getOperationalControls,
  getOperatorOverview,
  updateOperationalControls,
} from '@/pilot/operations'
import { createUploadSession } from '@/media/library'
import { acceptPilotInvitation, createPilotInvitation } from '@/pilot/invitations'
import config from '@/payload.config'
import type { PilotMember } from '@/payload-types'
import { cleanMediaRecords } from '../helpers/cleanMediaRecords'

let payload: Payload
let operator: PilotMember

const now = new Date('2026-09-15T09:00:00.000Z')

async function clean(): Promise<void> {
  await cleanMediaRecords(payload)
  await payload.delete({ collection: 'media-operations', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'pilot-members', overrideAccess: true, where: {} })
}

async function createMember(
  email: string,
  role: 'operator' | 'uploader',
): Promise<PilotMember> {
  return payload.create({
    collection: 'pilot-members',
    data: {
      email,
      invitationAcceptedAt: now.toISOString(),
      name: email,
      password: 'member-password',
      role,
      status: 'active',
    },
    overrideAccess: true,
  })
}

describe('operator oversight', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  beforeEach(async () => {
    await clean()
    operator = await createMember('operator-oversight@example.test', 'operator')
  })

  afterAll(clean)

  it('lets active operators inspect every Pilot Member and Media Asset', async () => {
    const uploader = await createMember('uploader-oversight@example.test', 'uploader')
    await payload.create({
      collection: 'media-assets',
      data: {
        fileName: 'operator-visible.mp4',
        mediaAssetId: 'asset_operator_oversight',
        mimeType: 'video/mp4',
        owner: uploader.id,
        size: 1024,
        status: 'failed',
        statusChangedAt: now.toISOString(),
      },
      overrideAccess: true,
    })

    await expect(getOperatorOverview(payload, operator)).resolves.toMatchObject({
      assets: [
        expect.objectContaining({
          fileName: 'operator-visible.mp4',
          ownerEmail: uploader.email,
          status: 'failed',
        }),
      ],
      members: expect.arrayContaining([
        expect.objectContaining({ email: operator.email, role: 'operator' }),
        expect.objectContaining({ email: uploader.email, role: 'uploader' }),
      ]),
    })

    await expect(getOperatorOverview(payload, uploader)).rejects.toMatchObject({ status: 403 })
  })

  it('lets an operator disable a member and records the operator action', async () => {
    const uploader = await createMember('disable-me@example.test', 'uploader')

    await disablePilotMember(payload, operator, uploader.id, { now })

    await expect(getOperatorOverview(payload, operator)).resolves.toMatchObject({
      auditEvents: [
        expect.objectContaining({
          action: 'member_disabled',
          actorEmail: operator.email,
          memberEmail: uploader.email,
          occurredAt: now.toISOString(),
        }),
      ],
      members: expect.arrayContaining([
        expect.objectContaining({ email: uploader.email, status: 'disabled' }),
      ]),
    })
  })

  it('lets only an operator configure provider concurrency and the kill switch', async () => {
    const uploader = await createMember('controls-uploader@example.test', 'uploader')

    await updateOperationalControls(
      payload,
      operator,
      { killSwitchEnabled: true, providerConcurrency: 4 },
      { now },
    )

    await expect(getOperationalControls(payload)).resolves.toEqual({
      killSwitchEnabled: true,
      providerConcurrency: 4,
    })
    await expect(
      updateOperationalControls(payload, uploader, {
        killSwitchEnabled: false,
        providerConcurrency: 2,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(getOperatorOverview(payload, operator)).resolves.toMatchObject({
      auditEvents: [expect.objectContaining({ action: 'operations_controls_updated' })],
    })
  })

  it('blocks new upload activity while the operator kill switch is enabled', async () => {
    const uploader = await createMember('blocked-upload@example.test', 'uploader')
    await updateOperationalControls(payload, operator, {
      killSwitchEnabled: true,
      providerConcurrency: 2,
    })

    await expect(
      createUploadSession(payload, uploader, {
        fileFingerprint: 'blocked-upload',
        fileName: 'blocked.mp4',
        mimeType: 'video/mp4',
        size: 1024,
      }),
    ).rejects.toMatchObject({ status: 503 })
  })

  it('records invitation creation and acceptance for operator investigation', async () => {
    const invitation = await createPilotInvitation({
      actor: operator,
      email: 'audited-invite@example.test',
      name: 'Audited invite',
      now,
      payload,
      role: 'uploader',
    })
    await acceptPilotInvitation({
      now: new Date(now.getTime() + 60_000),
      password: 'accepted-password',
      payload,
      token: invitation.token,
    })

    const overview = await getOperatorOverview(payload, operator)
    expect(overview.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'invitation_created' }),
        expect.objectContaining({ action: 'invitation_accepted' }),
      ]),
    )
  })
})
