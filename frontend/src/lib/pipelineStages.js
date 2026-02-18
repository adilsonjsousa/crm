export const PIPELINE_STAGES = [
  { value: "lead", label: "LEAD" },
  { value: "qualificacao", label: "QUALIFICAÇÃO" },
  { value: "proposta", label: "PROPOSTA" },
  { value: "follow_up", label: "FOLLOW-UP" },
  { value: "stand_by", label: "STAND-BY" },
  { value: "ganho", label: "GANHO" },
  { value: "perdido", label: "PERDIDO" }
];

const STAGE_LABELS = PIPELINE_STAGES.reduce((acc, stage) => {
  acc[stage.value] = stage.label;
  return acc;
}, {});

const NEXT_STAGE_MAP = {
  lead: ["qualificacao"],
  qualificacao: ["proposta"],
  proposta: ["follow_up"],
  follow_up: ["stand_by"],
  stand_by: ["ganho"],
  ganho: ["perdido"],
  perdido: []
};

const STAGE_INDEX = PIPELINE_STAGES.reduce((acc, stage, index) => {
  acc[stage.value] = index;
  return acc;
}, {});

export function stageLabel(stage) {
  return STAGE_LABELS[stage] || stage;
}

export function canMoveToStage(currentStage, targetStage) {
  if (!currentStage || !targetStage || currentStage === targetStage) return false;
  return (NEXT_STAGE_MAP[currentStage] || []).includes(targetStage);
}

export function stageStatus(stage) {
  if (stage === "ganho") return "won";
  if (stage === "perdido") return "lost";
  return "open";
}

export function sortByStageOrder(rows) {
  return [...rows].sort((a, b) => {
    const aIndex = STAGE_INDEX[a.stage] ?? Number.MAX_SAFE_INTEGER;
    const bIndex = STAGE_INDEX[b.stage] ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });
}
