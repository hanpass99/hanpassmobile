export const staffCreationErrorCodes = [
  "staff_email_exists",
  "staff_password_rejected",
  "staff_create_failed",
  "staff_provision_failed",
  "staff_cleanup_failed",
] as const;

export type StaffCreationErrorCode = (typeof staffCreationErrorCodes)[number];

export function classifyStaffCreationError(
  error: { code?: string; message?: string } | null,
): StaffCreationErrorCode {
  if (
    error?.code === "email_exists" ||
    error?.code === "user_already_exists" ||
    /already (?:been )?registered/i.test(error?.message ?? "")
  )
    return "staff_email_exists";
  if (error?.code === "weak_password") return "staff_password_rejected";
  return "staff_create_failed";
}
