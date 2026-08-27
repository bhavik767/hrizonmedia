/**
 * An Article's publication date, spelled out so it cannot be misread.
 *
 * `11/02/2026` means two different days depending on where the reader is, and
 * the date is on the page precisely so they can judge whether the piece is
 * still current. Fixed to UTC so the day does not shift with the server's
 * timezone between a build and a request.
 */
export function formatArticleDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  })
}
