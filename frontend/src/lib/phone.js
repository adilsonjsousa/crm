function onlyPhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeLocalBrazilPhoneDigits(value) {
  let digits = onlyPhoneDigits(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length > 11) {
    digits = digits.slice(0, 11);
  }
  return digits;
}

export function formatBrazilPhone(value) {
  const digits = normalizeLocalBrazilPhoneDigits(value);
  if (!digits) return "";

  const ddd = digits.slice(0, 2);
  const local = digits.slice(2);

  if (digits.length <= 2) return `(${ddd}`;
  if (digits.length <= 6) return `(${ddd}) ${local}`;
  if (digits.length <= 10) return `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`;
}

export function isValidBrazilPhone(value) {
  const digits = normalizeLocalBrazilPhoneDigits(value);
  return digits.length === 10 || digits.length === 11;
}

export function validateBrazilPhoneOrEmpty(value, label = "Telefone") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!isValidBrazilPhone(raw)) {
    throw new Error(`${label} deve estar no formato (DDD) 1234-1234 ou (DDD) 12345-1234.`);
  }
  return formatBrazilPhone(raw);
}

export function toWhatsAppBrazilNumber(value) {
  const digits = normalizeLocalBrazilPhoneDigits(value);
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  const rawDigits = onlyPhoneDigits(value);
  if (rawDigits.startsWith("55")) return rawDigits;
  return "";
}

export function toTelDigits(value) {
  const digits = normalizeLocalBrazilPhoneDigits(value);
  if (digits.length === 10 || digits.length === 11) return digits;
  return onlyPhoneDigits(value);
}
