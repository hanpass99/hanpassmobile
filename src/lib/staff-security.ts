export const DISABLED_BAN_DURATION = "876000h";

export function isApprovedStaff(profile: { approval_status?: string; is_active?: boolean } | null | undefined) {
  return profile?.approval_status === "approved" && profile.is_active === true;
}

export function staffBanDuration(active: boolean) {
  return active ? "none" : DISABLED_BAN_DURATION;
}