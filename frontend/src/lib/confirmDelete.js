export const DELETE_CONFIRM_WORD = "EXCLUIR";

export function confirmStrongDelete({
  entityLabel = "este registro",
  itemLabel = "",
  confirmWord = DELETE_CONFIRM_WORD
} = {}) {
  if (typeof window === "undefined") return false;

  const normalizedEntity = String(entityLabel || "este registro").trim();
  const normalizedItem = String(itemLabel || "").trim();
  const normalizedWord = String(confirmWord || DELETE_CONFIRM_WORD)
    .trim()
    .toUpperCase();

  const promptLines = [
    `Para excluir ${normalizedEntity}${normalizedItem ? ` "${normalizedItem}"` : ""}, digite ${normalizedWord}.`,
    "Esta ação é permanente e não poderá ser desfeita."
  ];

  const typed = window.prompt(promptLines.join("\n"), "");
  if (typed === null) return false;
  return String(typed).trim().toUpperCase() === normalizedWord;
}
