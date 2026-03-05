export type ContactMethod = "NONE" | "WHATSAPP_GROUP" | "ORGANIZER_PHONE";
export type ContactVisibility = "SIGNED_IN_ONLY" | "ATTENDING_ONLY";

export const CONTACT_METHOD_OPTIONS: Array<{
  value: ContactMethod;
  label: string;
}> = [
  { value: "NONE", label: "No contact" },
  { value: "WHATSAPP_GROUP", label: "WhatsApp group link" },
  { value: "ORGANIZER_PHONE", label: "Organizer phone (shared)" },
];

export function isValidContactMethod(value: string): value is ContactMethod {
  return CONTACT_METHOD_OPTIONS.some((option) => option.value === value);
}

export const CONTACT_VISIBILITY_OPTIONS: Array<{
  value: ContactVisibility;
  label: string;
}> = [
  { value: "SIGNED_IN_ONLY", label: "Signed-in users" },
  { value: "ATTENDING_ONLY", label: "Attending users only" },
];

export function isValidContactVisibility(
  value: string,
): value is ContactVisibility {
  return CONTACT_VISIBILITY_OPTIONS.some((option) => option.value === value);
}
