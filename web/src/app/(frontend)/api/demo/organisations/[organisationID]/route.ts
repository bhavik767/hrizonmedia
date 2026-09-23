import { deleteOrganisation } from '@/organisations/platform-administration'
import { withAuthenticatedPilotMember } from '@/media/request'

function parseOrganisationID(value: string): number | null {
  const organisationID = Number(value)
  return Number.isSafeInteger(organisationID) && organisationID > 0 ? organisationID : null
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ organisationID: string }> },
): Promise<Response> {
  return withAuthenticatedPilotMember(request, async ({ member, payload }) => {
    const organisationID = parseOrganisationID((await context.params).organisationID)
    if (!organisationID) return Response.json({ error: 'Organisation not found.' }, { status: 404 })
    await deleteOrganisation(payload, member, { organisationID })
    return new Response(null, { status: 204 })
  })
}
