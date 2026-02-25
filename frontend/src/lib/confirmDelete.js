export const DELETE_CONFIRM_WORD = "EXCLUIR";

export function confirmStrongDelete({
  entityLabel = "este registro",
  itemLabel = "",
  confirmWord = DELETE_CONFIRM_WORD
} = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);

  const normalizedEntity = String(entityLabel || "este registro").trim();
  const normalizedItem = String(itemLabel || "").trim();
  const normalizedWord = String(confirmWord || DELETE_CONFIRM_WORD).trim().toUpperCase();

  return new Promise((resolve) => {
    const previousOverflow = document.body.style.overflow;
    let isClosed = false;

    const cleanup = (result) => {
      if (isClosed) return;
      isClosed = true;
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      overlay.remove();
      resolve(Boolean(result));
    };

    const overlay = document.createElement("div");
    overlay.className = "edit-company-modal-overlay";
    overlay.setAttribute("role", "presentation");

    const card = document.createElement("article");
    card.className = "edit-company-modal-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Confirmar exclusão");
    card.addEventListener("click", (event) => event.stopPropagation());

    const header = document.createElement("div");
    header.className = "edit-company-modal-header";

    const title = document.createElement("h2");
    title.textContent = "Confirmar exclusão";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn-ghost btn-table-action";
    closeButton.textContent = "Fechar";
    closeButton.addEventListener("click", () => cleanup(false));

    header.appendChild(title);
    header.appendChild(closeButton);

    const description = document.createElement("p");
    description.className = "muted";
    description.textContent = `Esta ação exclui ${normalizedEntity} de forma permanente. Para continuar, digite ${normalizedWord}.`;

    const itemRow = document.createElement("p");
    const itemStrong = document.createElement("strong");
    itemStrong.textContent = "Item:";
    itemRow.appendChild(itemStrong);
    itemRow.appendChild(document.createTextNode(` ${normalizedItem || "-"}`));

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Digite ${normalizedWord}`;
    input.autocomplete = "off";

    const actions = document.createElement("div");
    actions.className = "inline-actions top-gap";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "btn-ghost";
    cancelButton.textContent = "Cancelar";
    cancelButton.addEventListener("click", () => cleanup(false));

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "btn-primary";
    confirmButton.textContent = "Confirmar exclusão";
    confirmButton.disabled = true;
    confirmButton.addEventListener("click", () => cleanup(true));

    const syncConfirmButton = () => {
      const canConfirm = String(input.value || "").trim().toUpperCase() === normalizedWord;
      confirmButton.disabled = !canConfirm;
      return canConfirm;
    };

    input.addEventListener("input", syncConfirmButton);

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(false);
        return;
      }
      if (event.key === "Enter" && syncConfirmButton()) {
        event.preventDefault();
        cleanup(true);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    overlay.addEventListener("click", () => cleanup(false));

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);

    card.appendChild(header);
    card.appendChild(description);
    card.appendChild(itemRow);
    card.appendChild(input);
    card.appendChild(actions);
    overlay.appendChild(card);

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    window.setTimeout(() => input.focus(), 0);
  });
}
