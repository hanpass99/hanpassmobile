export function mustChangePassword(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.must_change_password === true;
}