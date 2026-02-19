import { useEffect, useMemo, useState } from "react";
import {
  createCompanyAsset,
  createCompanyAssetPhoto,
  getCompanyById,
  listCompanyAssets,
  listCompanyContacts,
  listCompanyHistory,
  listCompanyInteractions,
  listCompanyOpportunities,
  listCompanyOpportunityStageHistory,
  listCompanySalesOrders,
  listCompanyTasks,
  uploadCompanyAssetPhoto
} from "../lib/revenueApi";
import { stageLabel } from "../lib/pipelineStages";
import { SALES_TYPES } from "../lib/productCatalog";

const CUSTOMER_MODAL_TABS = [
  { id: "overview", label: "Resumo" },
  { id: "history", label: "Historico" },
  { id: "opportunities", label: "Propostas" },
  { id: "tasks", label: "Agenda" },
  { id: "assets", label: "Raio-X do Parque" },
  { id: "interactions", label: "Interacoes" }
];

function emptyAssetForm() {
  return {
    model_name: "",
    contract_cost: "",
    acquisition_date: "",
    install_date: "",
    serial_number: "",
    location_description: "",
    notes: ""
  };
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function formatBirthDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function taskStatusLabel(value) {
  const map = {
    todo: "A Fazer",
    in_progress: "Em Andamento",
    done: "Concluida",
    cancelled: "Cancelada"
  };
  return map[value] || String(value || "-");
}

function visitMethodLabel(value) {
  const map = {
    geo: "Geolocalizacao",
    geo_pin: "Geolocalizacao + PIN"
  };
  return map[value] || "Geolocalizacao";
}

function opportunityStatusLabel(value) {
  const map = {
    open: "Aberta",
    won: "Ganha",
    lost: "Perdida",
    on_hold: "Em espera"
  };
  return map[value] || String(value || "-");
}

function interactionTypeLabel(value) {
  const map = {
    whatsapp: "WhatsApp",
    call: "Chamada",
    note: "Anotacao"
  };
  return map[value] || String(value || "-");
}

function directionLabel(value) {
  const map = {
    inbound: "Entrada",
    outbound: "Saida"
  };
  return map[value] || "-";
}

function orderStatusLabel(value) {
  const map = {
    pending: "Pendente",
    approved: "Aprovado",
    cancelled: "Cancelado",
    draft: "Rascunho"
  };
  return map[value] || String(value || "-");
}

function orderTypeLabel(value) {
  return SALES_TYPES.find((item) => item.value === value)?.label || String(value || "-");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isVisitTask(task) {
  const haystack = `${task?.task_type || ""} ${task?.title || ""}`;
  const normalized = normalizeText(haystack);
  return normalized.includes("visita") || normalized.includes("visit");
}

function shortText(value, maxLength = 180) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "-";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function nextTaskDateValue(task) {
  if (task?.scheduled_start_at) {
    const parsed = new Date(task.scheduled_start_at).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (task?.due_date) {
    const parsed = new Date(`${task.due_date}T00:00:00`).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.POSITIVE_INFINITY;
}

function visitExecutionSummary(task) {
  if (!isVisitTask(task)) return "-";
  if (task.visit_checkout_at) {
    return `Check-out ${formatDateTime(task.visit_checkout_at)} · ${task.visit_checkout_note || "Sem resumo"}`;
  }
  if (task.visit_checkin_at) {
    const distance = Number(task.visit_checkin_distance_meters);
    const distanceLabel = Number.isFinite(distance) ? ` · Distancia ${Math.round(distance)}m` : "";
    return `Check-in ${formatDateTime(task.visit_checkin_at)} (${visitMethodLabel(task.visit_checkin_method)})${distanceLabel}`;
  }
  return "Check-in pendente";
}

export default function CustomerHistoryModal({ open, companyId, companyName, onClose }) {
  const [selectedTab, setSelectedTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [companyProfile, setCompanyProfile] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [opportunityStageRows, setOpportunityStageRows] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [assetForm, setAssetForm] = useState(() => emptyAssetForm());
  const [savingAsset, setSavingAsset] = useState(false);
  const [uploadingAssetId, setUploadingAssetId] = useState("");
  const [assetFeedback, setAssetFeedback] = useState({ type: "", message: "" });

  useEffect(() => {
    if (!open) return;
    function handleEscape(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !companyId) return;
    let active = true;

    setSelectedTab("overview");
    setLoading(true);
    setError("");
    setAssetFeedback({ type: "", message: "" });
    setAssetForm(emptyAssetForm());

    Promise.all([
      getCompanyById(companyId),
      listCompanyHistory({ companyId, limit: 220 }),
      listCompanyOpportunities(companyId),
      listCompanyOpportunityStageHistory(companyId),
      listCompanyTasks(companyId),
      listCompanyContacts(companyId),
      listCompanyInteractions(companyId),
      listCompanySalesOrders(companyId),
      listCompanyAssets(companyId)
    ])
      .then((result) => {
        if (!active) return;
        const [profileData, historyData, opportunityData, stageData, taskData, contactData, interactionData, ordersData, assetsData] =
          result;
        setCompanyProfile(profileData);
        setHistoryRows(historyData);
        setOpportunities(opportunityData);
        setOpportunityStageRows(stageData);
        setTasks(taskData);
        setContacts(contactData);
        setInteractions(interactionData);
        setSalesOrders(ordersData);
        setAssets(assetsData);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [companyId, open]);

  const visitTasks = useMemo(() => tasks.filter((task) => isVisitTask(task)), [tasks]);
  const pendingTasks = useMemo(
    () => tasks.filter((task) => task.status === "todo" || task.status === "in_progress"),
    [tasks]
  );

  const openOpportunities = useMemo(
    () => opportunities.filter((item) => item.status === "open").length,
    [opportunities]
  );

  const latestInteraction = useMemo(() => interactions[0] || null, [interactions]);

  const nextVisit = useMemo(() => {
    const activeVisits = visitTasks.filter((task) => task.status !== "done" && task.status !== "cancelled");
    if (!activeVisits.length) return null;
    const ordered = [...activeVisits].sort((a, b) => nextTaskDateValue(a) - nextTaskDateValue(b));
    return ordered[0] || null;
  }, [visitTasks]);

  const totalContractCost = useMemo(
    () => assets.reduce((acc, item) => acc + Number(item.contract_cost || 0), 0),
    [assets]
  );

  const timelineRows = useMemo(() => {
    const eventItems = historyRows.map((row) => {
      const payload = row.payload || {};
      if (row.event_name === "task_flow_status_changed") {
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          origin: "agenda",
          item: payload.task_title || "Atividade",
          details: `${taskStatusLabel(payload.from_status)} -> ${taskStatusLabel(payload.to_status)}`,
          note: payload.comment || "-"
        };
      }
      if (row.event_name === "task_visit_checkin") {
        const distance = Number(payload.checkin_distance_meters);
        const radius = Number(payload.target_radius_meters);
        const distanceLabel = Number.isFinite(distance) ? `${Math.round(distance)}m` : "sem referencia de distancia";
        const radiusLabel = Number.isFinite(radius) ? ` (raio ${Math.round(radius)}m)` : "";
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          origin: "visita",
          item: payload.task_title || "Visita",
          details: `Check-in (${visitMethodLabel(payload.method)})`,
          note: `${distanceLabel}${radiusLabel}${payload.checkin_note ? ` · ${payload.checkin_note}` : ""}`
        };
      }
      if (row.event_name === "task_visit_checkout") {
        const duration = Number(payload.duration_minutes);
        const durationLabel = Number.isFinite(duration) ? `Duracao ${duration} min` : "Duracao nao calculada";
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          origin: "visita",
          item: payload.task_title || "Visita",
          details: "Check-out concluido",
          note: `${durationLabel}${payload.checkout_note ? ` · ${payload.checkout_note}` : ""}`
        };
      }
      return {
        id: `event-${row.id}`,
        happened_at: row.happened_at,
        origin: "evento",
        item: row.event_name || "Evento",
        details: "-",
        note: shortText(payload.comment || JSON.stringify(payload || {}))
      };
    });

    const stageItems = opportunityStageRows.map((row) => ({
      id: `stage-${row.id}`,
      happened_at: row.changed_at,
      origin: "pipeline",
      item: row.opportunities?.title || "Proposta",
      details: `${stageLabel(row.from_stage) || "-"} -> ${stageLabel(row.to_stage) || "-"}`,
      note: "Mudanca de etapa"
    }));

    const interactionItems = interactions.map((row) => ({
      id: `interaction-${row.id}`,
      happened_at: row.occurred_at || row.created_at,
      origin: interactionTypeLabel(row.interaction_type),
      item: row.subject || interactionTypeLabel(row.interaction_type),
      details: `${directionLabel(row.direction)} · ${row.contacts?.full_name || "Sem contato"}`,
      note: shortText(row.content)
    }));

    const visitItems = visitTasks.map((task) => ({
      id: `visit-${task.id}`,
      happened_at: task.scheduled_start_at || task.due_date || task.created_at,
      origin: "visita",
      item: task.title || "Visita",
      details: taskStatusLabel(task.status),
      note: shortText(task.description)
    }));

    return [...eventItems, ...stageItems, ...interactionItems, ...visitItems].sort(
      (a, b) => new Date(b.happened_at).getTime() - new Date(a.happened_at).getTime()
    );
  }, [historyRows, interactions, opportunityStageRows, visitTasks]);

  async function reloadAssets() {
    if (!companyId) return;
    const data = await listCompanyAssets(companyId);
    setAssets(data);
  }

  async function handleCreateAsset(event) {
    event.preventDefault();
    if (!companyId) return;

    const modelName = String(assetForm.model_name || "").trim();
    if (!modelName) {
      setAssetFeedback({ type: "error", message: "Informe o modelo do equipamento." });
      return;
    }

    const contractCostRaw = String(assetForm.contract_cost || "").trim();
    const normalizedCost = contractCostRaw ? Number(contractCostRaw.replace(",", ".")) : null;
    if (normalizedCost !== null && !Number.isFinite(normalizedCost)) {
      setAssetFeedback({ type: "error", message: "Custo de contrato invalido." });
      return;
    }

    setSavingAsset(true);
    setAssetFeedback({ type: "", message: "" });

    try {
      await createCompanyAsset({
        company_id: companyId,
        model_name: modelName,
        contract_cost: normalizedCost,
        acquisition_date: assetForm.acquisition_date || null,
        install_date: assetForm.install_date || null,
        serial_number: assetForm.serial_number || null,
        location_description: assetForm.location_description || null,
        notes: assetForm.notes || null
      });

      setAssetForm(emptyAssetForm());
      await reloadAssets();
      setAssetFeedback({ type: "success", message: "Equipamento adicionado ao raio-x do cliente." });
    } catch (err) {
      setAssetFeedback({ type: "error", message: err.message });
    } finally {
      setSavingAsset(false);
    }
  }

  async function handleAddAssetPhoto(event, assetId) {
    event.preventDefault();
    if (!companyId || !assetId) return;

    const formData = new FormData(event.currentTarget);
    const fileRaw = formData.get("photo_file");
    const file = typeof File !== "undefined" && fileRaw instanceof File && fileRaw.size ? fileRaw : null;
    const directPhotoUrl = String(formData.get("photo_url") || "").trim();
    const caption = String(formData.get("caption") || "").trim();

    if (!file && !directPhotoUrl) {
      setAssetFeedback({ type: "error", message: "Selecione uma foto ou informe URL da imagem para anexar." });
      return;
    }

    setUploadingAssetId(assetId);
    setAssetFeedback({ type: "", message: "" });

    try {
      let photoUrl = directPhotoUrl;
      let storagePath = null;

      if (file) {
        const uploadResult = await uploadCompanyAssetPhoto({
          companyId,
          assetId,
          file
        });
        photoUrl = uploadResult.publicUrl;
        storagePath = uploadResult.storagePath;
      }

      await createCompanyAssetPhoto({
        asset_id: assetId,
        photo_url: photoUrl,
        storage_path: storagePath,
        caption: caption || null
      });

      event.currentTarget.reset();
      await reloadAssets();
      setAssetFeedback({ type: "success", message: "Foto anexada ao equipamento." });
    } catch (err) {
      setAssetFeedback({ type: "error", message: err.message });
    } finally {
      setUploadingAssetId("");
    }
  }

  if (!open) return null;

  const customerLabel = companyProfile?.trade_name || companyName || "Cliente";

  return (
    <div className="customer-popup-overlay" role="presentation" onClick={onClose}>
      <article
        className="customer-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`Historico do cliente ${customerLabel}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="customer-popup-header">
          <div>
            <h3>Historico do cliente</h3>
            <p className="muted">
              <strong>{customerLabel}</strong>
            </p>
          </div>
          <button type="button" className="btn-ghost btn-table-action" onClick={onClose}>
            Fechar
          </button>
        </header>

        <div className="inline-actions company-tabs customer-popup-tabs">
          {CUSTOMER_MODAL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn-ghost btn-table-action ${selectedTab === tab.id ? "is-active" : ""}`}
              onClick={() => setSelectedTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? <p className="error-text top-gap">{error}</p> : null}
        {loading ? <p className="muted top-gap">Carregando historico completo do cliente...</p> : null}

        {!loading && selectedTab === "overview" ? (
          <div className="customer-popup-overview">
            <div className="customer-popup-overview-grid">
              <article className="customer-popup-card">
                <h4>Cadastro</h4>
                <dl className="customer-popup-facts">
                  <div>
                    <dt>Empresa</dt>
                    <dd>{companyProfile?.trade_name || customerLabel}</dd>
                  </div>
                  <div>
                    <dt>Razao social</dt>
                    <dd>{companyProfile?.legal_name || "-"}</dd>
                  </div>
                  <div>
                    <dt>CNPJ</dt>
                    <dd>{companyProfile?.cnpj || "-"}</dd>
                  </div>
                  <div>
                    <dt>Segmento</dt>
                    <dd>{companyProfile?.segmento || "-"}</dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{companyProfile?.email || "-"}</dd>
                  </div>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{companyProfile?.phone || "-"}</dd>
                  </div>
                  <div className="customer-popup-fact-wide">
                    <dt>Endereco</dt>
                    <dd>{companyProfile?.address_full || "Nao informado"}</dd>
                  </div>
                </dl>
              </article>

              <article className="customer-popup-card">
                <h4>Visao comercial</h4>
                <div className="customer-popup-kpis">
                  <div>
                    <span>Propostas no pipeline</span>
                    <strong>{opportunities.length}</strong>
                    <small>{openOpportunities} abertas</small>
                  </div>
                  <div>
                    <span>Pedidos/propostas emitidas</span>
                    <strong>{salesOrders.length}</strong>
                    <small>{brl(salesOrders.reduce((acc, row) => acc + Number(row.total_amount || 0), 0))}</small>
                  </div>
                  <div>
                    <span>Atividades pendentes</span>
                    <strong>{pendingTasks.length}</strong>
                    <small>{visitTasks.length} visitas</small>
                  </div>
                  <div>
                    <span>Interacoes registradas</span>
                    <strong>{interactions.length}</strong>
                    <small>{latestInteraction ? formatDateTime(latestInteraction.occurred_at || latestInteraction.created_at) : "-"}</small>
                  </div>
                  <div>
                    <span>Equipamentos no parque</span>
                    <strong>{assets.length}</strong>
                    <small>{assets.length ? "Raio-x atualizado" : "Nenhum equipamento cadastrado"}</small>
                  </div>
                  <div>
                    <span>Custo contratual do parque</span>
                    <strong>{brl(totalContractCost)}</strong>
                    <small>{assets.length ? "Soma dos custos por equipamento" : "-"}</small>
                  </div>
                </div>
                <p className="customer-popup-highlight">
                  Proxima visita:{" "}
                  <strong>
                    {nextVisit
                      ? `${nextVisit.title || "Visita"} (${formatDateTime(
                          nextVisit.scheduled_start_at || nextVisit.due_date || nextVisit.created_at
                        )})`
                      : "Nenhuma visita pendente"}
                  </strong>
                </p>
              </article>
            </div>

            <article className="customer-popup-card top-gap">
              <h4>Contatos e acoes rapidas</h4>
              <div className="table-wrap top-gap">
                <table>
                  <thead>
                    <tr>
                      <th>Contato</th>
                      <th>E-mail</th>
                      <th>WhatsApp</th>
                      <th>Nascimento</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => {
                      const whatsappDigits = normalizePhoneDigits(contact.whatsapp || contact.phone);
                      const phoneDigits = normalizePhoneDigits(contact.phone || contact.whatsapp);
                      return (
                        <tr key={contact.id}>
                          <td>{contact.full_name || "-"}</td>
                          <td>{contact.email || "-"}</td>
                          <td>{contact.whatsapp || contact.phone || "-"}</td>
                          <td>{formatBirthDate(contact.birth_date)}</td>
                          <td>
                            <div className="inline-actions">
                              {contact.email ? (
                                <a className="btn-ghost btn-table-action" href={`mailto:${contact.email}`}>
                                  E-mail
                                </a>
                              ) : null}
                              {whatsappDigits ? (
                                <a
                                  className="btn-ghost btn-table-action"
                                  href={`https://wa.me/${whatsappDigits}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  WhatsApp
                                </a>
                              ) : null}
                              {phoneDigits ? (
                                <a className="btn-ghost btn-table-action" href={`tel:${phoneDigits}`}>
                                  Ligar
                                </a>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!contacts.length ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          Nenhum contato cadastrado para este cliente.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        ) : null}

        {!loading && selectedTab === "history" ? (
          <div className="table-wrap top-gap">
            <table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Origem</th>
                  <th>Item</th>
                  <th>Detalhe</th>
                  <th>Resumo</th>
                </tr>
              </thead>
              <tbody>
                {timelineRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.happened_at)}</td>
                    <td>{row.origin}</td>
                    <td>{row.item || "-"}</td>
                    <td>{row.details || "-"}</td>
                    <td>{row.note || "-"}</td>
                  </tr>
                ))}
                {!timelineRows.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Ainda nao ha historico para este cliente.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && selectedTab === "opportunities" ? (
          <div className="customer-popup-opportunities">
            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Proposta no pipeline</th>
                    <th>Etapa</th>
                    <th>Status</th>
                    <th>Valor estimado</th>
                    <th>Fechamento previsto</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title || "-"}</td>
                      <td>{stageLabel(item.stage) || "-"}</td>
                      <td>{opportunityStatusLabel(item.status)}</td>
                      <td>{brl(item.estimated_value)}</td>
                      <td>{formatDate(item.expected_close_date)}</td>
                    </tr>
                  ))}
                  {!opportunities.length ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        Nenhuma proposta no pipeline para este cliente.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Proposta</th>
                    <th>Etapa anterior</th>
                    <th>Nova etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunityStageRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.changed_at)}</td>
                      <td>{row.opportunities?.title || "-"}</td>
                      <td>{stageLabel(row.from_stage) || "-"}</td>
                      <td>{stageLabel(row.to_stage) || "-"}</td>
                    </tr>
                  ))}
                  {!opportunityStageRows.length ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        Sem mudancas de etapa registradas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Pedido/Proposta</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Valor total</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {salesOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.order_number || "-"}</td>
                      <td>{orderTypeLabel(order.order_type)}</td>
                      <td>{orderStatusLabel(order.status)}</td>
                      <td>{brl(order.total_amount)}</td>
                      <td>{formatDate(order.order_date)}</td>
                    </tr>
                  ))}
                  {!salesOrders.length ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        Nenhum pedido/proposta emitida para este cliente.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!loading && selectedTab === "tasks" ? (
          <div className="table-wrap top-gap">
            <table>
              <thead>
                <tr>
                  <th>Atividade</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Prioridade</th>
                  <th>Agendamento</th>
                  <th>Data limite</th>
                  <th>Execucao em campo</th>
                  <th>Descricao</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title || "-"}</td>
                    <td>
                      {task.task_type || "-"}{" "}
                      {isVisitTask(task) ? <span className="badge customer-visit-badge">Visita</span> : null}
                    </td>
                    <td>{taskStatusLabel(task.status)}</td>
                    <td>{task.priority || "-"}</td>
                    <td>
                      {task.scheduled_start_at
                        ? `${formatDateTime(task.scheduled_start_at)}${
                            task.scheduled_end_at ? ` ate ${formatDateTime(task.scheduled_end_at)}` : ""
                          }`
                        : "-"}
                    </td>
                    <td>{formatDate(task.due_date)}</td>
                    <td>{visitExecutionSummary(task)}</td>
                    <td>{task.description || "-"}</td>
                  </tr>
                ))}
                {!tasks.length ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      Nenhuma atividade de agenda para este cliente.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && selectedTab === "assets" ? (
          <div className="customer-assets-wrap">
            <article className="customer-popup-card top-gap">
              <h4>Raio-X do parque instalado</h4>
              <form className="form-grid top-gap" onSubmit={handleCreateAsset}>
                <input
                  required
                  placeholder="Modelo do equipamento"
                  value={assetForm.model_name}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, model_name: event.target.value }))}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Custo de contrato (R$)"
                  value={assetForm.contract_cost}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, contract_cost: event.target.value }))}
                />
                <input
                  type="date"
                  placeholder="Data de aquisicao"
                  value={assetForm.acquisition_date}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, acquisition_date: event.target.value }))}
                />
                <input
                  type="date"
                  placeholder="Data de instalacao"
                  value={assetForm.install_date}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, install_date: event.target.value }))}
                />
                <input
                  placeholder="Numero de serie (opcional)"
                  value={assetForm.serial_number}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, serial_number: event.target.value }))}
                />
                <input
                  placeholder="Local instalado (opcional)"
                  value={assetForm.location_description}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, location_description: event.target.value }))}
                />
                <textarea
                  placeholder="Observacoes tecnicas (opcional)"
                  value={assetForm.notes}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
                <div className="inline-actions">
                  <button type="submit" className="btn-primary" disabled={savingAsset}>
                    {savingAsset ? "Salvando..." : "Adicionar equipamento"}
                  </button>
                </div>
              </form>
              {assetFeedback.message ? (
                <p className={assetFeedback.type === "error" ? "error-text" : "success-text"}>{assetFeedback.message}</p>
              ) : null}
            </article>

            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Custo contrato</th>
                    <th>Aquisicao</th>
                    <th>Instalacao</th>
                    <th>Serie</th>
                    <th>Local</th>
                    <th>Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <tr key={asset.id}>
                      <td>{asset.model_name || "-"}</td>
                      <td>{asset.contract_cost === null || asset.contract_cost === undefined ? "-" : brl(asset.contract_cost)}</td>
                      <td>{formatDate(asset.acquisition_date)}</td>
                      <td>{formatDate(asset.install_date)}</td>
                      <td>{asset.serial_number || "-"}</td>
                      <td>{asset.location_description || "-"}</td>
                      <td>{Array.isArray(asset.photos) ? asset.photos.length : 0}</td>
                    </tr>
                  ))}
                  {!assets.length ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        Nenhum equipamento cadastrado no parque deste cliente.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {assets.map((asset) => (
              <article key={`asset-photo-${asset.id}`} className="customer-popup-card top-gap">
                <div className="customer-asset-heading">
                  <h4>{asset.model_name || "Equipamento"}</h4>
                  <p className="muted">
                    Custo contrato:{" "}
                    <strong>
                      {asset.contract_cost === null || asset.contract_cost === undefined ? "-" : brl(asset.contract_cost)}
                    </strong>
                    {" · "}Aquisicao: <strong>{formatDate(asset.acquisition_date)}</strong>
                  </p>
                </div>

                <form className="form-grid top-gap" onSubmit={(event) => handleAddAssetPhoto(event, asset.id)}>
                  <input type="file" name="photo_file" accept="image/png,image/jpeg,image/webp" />
                  <input name="photo_url" placeholder="Ou informe URL da foto (opcional)" />
                  <input name="caption" placeholder="Legenda da foto (opcional)" />
                  <div className="inline-actions">
                    <button type="submit" className="btn-primary" disabled={uploadingAssetId === asset.id}>
                      {uploadingAssetId === asset.id ? "Enviando foto..." : "Adicionar foto"}
                    </button>
                  </div>
                </form>

                <div className="customer-asset-photo-grid top-gap">
                  {(asset.photos || []).map((photo) => (
                    <figure key={photo.id} className="customer-asset-photo-card">
                      <img src={photo.photo_url} alt={photo.caption || asset.model_name || "Equipamento"} loading="lazy" />
                      <figcaption>{photo.caption || "Sem legenda"}</figcaption>
                    </figure>
                  ))}
                  {!asset.photos?.length ? <p className="muted">Sem fotos para este equipamento.</p> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {!loading && selectedTab === "interactions" ? (
          <div className="table-wrap top-gap">
            <table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Tipo</th>
                  <th>Direcao</th>
                  <th>Contato</th>
                  <th>Canal</th>
                  <th>Assunto</th>
                  <th>Resumo</th>
                </tr>
              </thead>
              <tbody>
                {interactions.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.occurred_at || row.created_at)}</td>
                    <td>{interactionTypeLabel(row.interaction_type)}</td>
                    <td>{directionLabel(row.direction)}</td>
                    <td>{row.contacts?.full_name || "-"}</td>
                    <td>{row.whatsapp_number || row.phone_number || "-"}</td>
                    <td>{row.subject || "-"}</td>
                    <td>{row.content || "-"}</td>
                  </tr>
                ))}
                {!interactions.length ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Sem interacoes registradas para este cliente.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>
    </div>
  );
}
