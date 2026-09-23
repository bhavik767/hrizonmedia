export function safeReturnTo(value: FormDataEntryValue | null | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/demo'
  }

  return value
}
