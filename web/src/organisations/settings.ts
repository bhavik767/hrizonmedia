import 'server-only'

import { Buffer } from 'node:buffer'
import type { Payload } from 'payload'
import sharp from 'sharp'

import { authorizeOrganisationMedia, OrganisationAuthorizationError } from './authorization'
import type { OrganisationSetting, PilotMember } from '@/payload-types'

const MAXIMUM_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024
const MAXIMUM_LOGO_SIZE_BYTES = 3 * 1024 * 1024

export class OrganisationSettingsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export type OrganisationSettingsInput = {
  defaultRetentionDays: number
  drmDefault: 'protected' | 'standard'
  drmRequired: boolean
  maximumUploadSizeBytes: number
}

export type OrganisationLogoInput = {
  bytes: Uint8Array
  mimeType: string
}

export type OrganisationUploadPolicy = {
  defaultRetentionDays: number
  drmDefault: 'protected' | 'standard'
  drmRequired: boolean
  maximumUploadSizeBytes: number
}

export type OrganisationSetupInput = OrganisationSettingsInput & { logo?: OrganisationLogoInput }

function validPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function validateInput(input: OrganisationSettingsInput): OrganisationSettingsInput {
  if (input.drmDefault !== 'protected' && input.drmDefault !== 'standard') {
    throw new OrganisationSettingsError('Choose a valid DRM default.', 400)
  }
  if (!validPositiveInteger(input.defaultRetentionDays)) {
    throw new OrganisationSettingsError('Choose a valid default retention period.', 400)
  }
  if (
    !validPositiveInteger(input.maximumUploadSizeBytes) ||
    input.maximumUploadSizeBytes > MAXIMUM_UPLOAD_SIZE_BYTES
  ) {
    throw new OrganisationSettingsError('Maximum upload size must be no larger than 2 GB.', 400)
  }
  return input
}

async function requireOrganisationAdministrator(
  payload: Payload,
  actor: PilotMember,
  organisationID: number,
): Promise<void> {
  try {
    const authorization = await authorizeOrganisationMedia(payload, actor, {
      operation: 'create',
      organisationID,
    })
    if (authorization.role !== 'administrator') {
      throw new OrganisationSettingsError('Organisation Administrator access required.', 403)
    }
  } catch (error) {
    if (error instanceof OrganisationAuthorizationError) {
      throw new OrganisationSettingsError(error.message, error.status)
    }
    throw error
  }
}

async function findOrganisationSettings(payload: Payload, organisationID: number) {
  const result = await payload.find({
    collection: 'organisation-settings',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { organisation: { equals: organisationID } },
  })
  const settings = result.docs[0]
  if (!settings) {
    throw new OrganisationSettingsError('The initial Organisation setup is not complete.', 409)
  }
  return settings
}

/**
 * Reads the policy that is snapshotted when an Organisation Upload Session is
 * created. Authorization belongs to the Organisation media boundary; callers
 * must authorize before asking for this policy.
 */
export async function getOrganisationUploadPolicy(
  payload: Payload,
  organisationID: number,
): Promise<OrganisationUploadPolicy> {
  const settings = await findOrganisationSettings(payload, organisationID)
  return {
    defaultRetentionDays: settings.defaultRetentionDays,
    drmDefault: settings.drmDefault,
    drmRequired: settings.drmRequired ?? false,
    maximumUploadSizeBytes: settings.maximumUploadSizeBytes,
  }
}

function logoMatchesMimeType(logo: OrganisationLogoInput): boolean {
  if (logo.mimeType === 'image/png') {
    return (
      logo.bytes[0] === 137 &&
      logo.bytes[1] === 80 &&
      logo.bytes[2] === 78 &&
      logo.bytes[3] === 71 &&
      logo.bytes[4] === 13 &&
      logo.bytes[5] === 10 &&
      logo.bytes[6] === 26 &&
      logo.bytes[7] === 10
    )
  }
  if (logo.mimeType === 'image/jpeg') {
    return logo.bytes[0] === 255 && logo.bytes[1] === 216 && logo.bytes[2] === 255
  }
  if (logo.mimeType === 'image/webp') {
    return (
      logo.bytes[0] === 82 &&
      logo.bytes[1] === 73 &&
      logo.bytes[2] === 70 &&
      logo.bytes[3] === 70 &&
      logo.bytes[8] === 87 &&
      logo.bytes[9] === 69 &&
      logo.bytes[10] === 66 &&
      logo.bytes[11] === 80
    )
  }
  return false
}

async function logoDataURL(logo: OrganisationLogoInput): Promise<string> {
  if (logo.bytes.byteLength === 0 || logo.bytes.byteLength > MAXIMUM_LOGO_SIZE_BYTES) {
    throw new OrganisationSettingsError('Organisation Logos must be no larger than 3 MB.', 400)
  }
  if (!logoMatchesMimeType(logo)) {
    throw new OrganisationSettingsError(
      'Organisation Logos must be PNG, JPEG, or WebP images.',
      400,
    )
  }
  try {
    const metadata = await sharp(logo.bytes).metadata()
    if (metadata.format !== logo.mimeType.replace('image/', ''))
      throw new Error('Mismatched format')
  } catch {
    throw new OrganisationSettingsError(
      'Organisation Logos must be valid PNG, JPEG, or WebP images.',
      400,
    )
  }
  return `data:${logo.mimeType};base64,${Buffer.from(logo.bytes).toString('base64')}`
}

export async function completeInitialOrganisationSetup(
  payload: Payload,
  actor: PilotMember,
  organisationID: number,
  input: OrganisationSetupInput,
): Promise<OrganisationSetting> {
  await requireOrganisationAdministrator(payload, actor, organisationID)
  const organisation = await payload.findByID({
    collection: 'organisations',
    depth: 0,
    id: organisationID,
    overrideAccess: true,
  })
  const initialAdministratorID =
    typeof organisation.initialAdministrator === 'number'
      ? organisation.initialAdministrator
      : organisation.initialAdministrator?.id
  if (initialAdministratorID !== actor.id) {
    throw new OrganisationSettingsError(
      'Only the initial Organisation Administrator can complete setup.',
      403,
    )
  }
  const existing = await payload.find({
    collection: 'organisation-settings',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { organisation: { equals: organisationID } },
  })
  if (existing.docs[0]) {
    throw new OrganisationSettingsError('Organisation setup is already complete.', 409)
  }
  const settings = validateInput(input)
  return payload.create({
    collection: 'organisation-settings',
    data: {
      ...settings,
      logoDataURL: input.logo ? await logoDataURL(input.logo) : undefined,
      organisation: organisationID,
      setupCompletedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
}

export async function getOrganisationSettingsState(
  payload: Payload,
  actor: PilotMember,
  organisationID: number,
): Promise<{ initialAdministrator: boolean; settings: OrganisationSetting | null }> {
  await requireOrganisationAdministrator(payload, actor, organisationID)
  const organisation = await payload.findByID({
    collection: 'organisations',
    depth: 0,
    id: organisationID,
    overrideAccess: true,
  })
  const initialAdministratorID =
    typeof organisation.initialAdministrator === 'number'
      ? organisation.initialAdministrator
      : organisation.initialAdministrator?.id
  const result = await payload.find({
    collection: 'organisation-settings',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { organisation: { equals: organisationID } },
  })
  return {
    initialAdministrator: initialAdministratorID === actor.id,
    settings: result.docs[0] ?? null,
  }
}

export async function updateOrganisationSettings(
  payload: Payload,
  actor: PilotMember,
  organisationID: number,
  input: OrganisationSettingsInput,
): Promise<OrganisationSetting> {
  await requireOrganisationAdministrator(payload, actor, organisationID)
  const settings = await findOrganisationSettings(payload, organisationID)
  return payload.update({
    collection: 'organisation-settings',
    data: validateInput(input),
    id: settings.id,
    overrideAccess: true,
  })
}

export async function updateOrganisationLogo(
  payload: Payload,
  actor: PilotMember,
  organisationID: number,
  logo: OrganisationLogoInput,
): Promise<OrganisationSetting> {
  await requireOrganisationAdministrator(payload, actor, organisationID)
  const settings = await findOrganisationSettings(payload, organisationID)
  return payload.update({
    collection: 'organisation-settings',
    data: { logoDataURL: await logoDataURL(logo) },
    id: settings.id,
    overrideAccess: true,
  })
}

export async function removeOrganisationLogo(
  payload: Payload,
  actor: PilotMember,
  organisationID: number,
): Promise<OrganisationSetting> {
  await requireOrganisationAdministrator(payload, actor, organisationID)
  const settings = await findOrganisationSettings(payload, organisationID)
  return payload.update({
    collection: 'organisation-settings',
    data: { logoDataURL: null },
    id: settings.id,
    overrideAccess: true,
  })
}
