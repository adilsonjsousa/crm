export const SALES_TYPES = [
  { value: "equipment", label: "Equipamentos" },
  { value: "supplies", label: "Suprimentos" },
  { value: "service", label: "Serviços" }
];

const EQUIPMENT_SUBCATEGORIES = [
  "ACABAMENTOS GRÁFICOS",
  "COMUNICAÇÃO VISUAL",
  "PRODUÇÃO COLOR",
  "PRODUÇÃO MONO",
  "OFFICE COLOR",
  "OFFICE MONO",
  "SUBLIMAÇÃO TÊXTIL"
];

const SUPPLIES_SUBCATEGORIES = [
  "TONER",
  "TINTAS",
  "GRAMPOS",
  "PEÇAS"
];

const SERVICE_SUBCATEGORIES = [
  "CHAMADO AVULSO",
  "CONTRATO MENSAL",
  "CONTRATO ALL IN"
];

export const OPPORTUNITY_SUBCATEGORIES = [
  ...EQUIPMENT_SUBCATEGORIES,
  ...SUPPLIES_SUBCATEGORIES,
  ...SERVICE_SUBCATEGORIES
];

export const PRODUCT_CATALOG_ROWS = [
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 320v", estimated_value: 7990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 4606", estimated_value: 19900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 500v", estimated_value: 29900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 670PX", estimated_value: 59990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 670RTS", estimated_value: 64900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 9211D", estimated_value: 119000 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Encadernadora HotMelt Semi- automatica", estimated_value: 15900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Encadernadora HotMelt 50R", estimated_value: 34900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Encadernadora HotMelt G470", estimated_value: 129000 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora F360E", estimated_value: 43990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora D4", estimated_value: 26990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora FM490", estimated_value: 25990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora F390E", estimated_value: 35990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte PC350", estimated_value: 16900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora 520c hidrauliuca", estimated_value: 1 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laser 1390", estimated_value: 39990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Fiber Laser 30 watts", estimated_value: 29900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Vincadeira e Serrilhadeira Full Auto", estimated_value: 25900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Grampeador 1 cabeca", estimated_value: 7900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Canteadeira", estimated_value: 7900 },
  { title: "COMUNICAÇÃO VISUAL", product: "Ecosolvente K 1801S - 1 i3200", estimated_value: 54900 },
  { title: "COMUNICAÇÃO VISUAL", product: "Ecosolvente K 1802S - 2 i3200", estimated_value: 79990 },
  { title: "COMUNICAÇÃO VISUAL", product: "Ecosolvente K 3204S - 4 i3200", estimated_value: 159990 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Rolo a Rolo 2K18UV 180 Branco e Verniz 2 i3200", estimated_value: 144990 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Rolo a Rolo 4K18UV 180 Branco e Verniz 4 i3200", estimated_value: 159990 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Cilindrico K180 3 Ricoh G4", estimated_value: 319000 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Cilindrico K180 3 Ricoh G6", estimated_value: 349000 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Mesa K6090 3 i1600", estimated_value: 109990 },
  { title: "SUBLIMAÇÃO TÊXTIL", product: "Sublimatica K1802TX 2 i3200", estimated_value: 79990 },
  { title: "SUBLIMAÇÃO TÊXTIL", product: "Sublimatica K1804TX MAX 4 i3200", estimated_value: 149990 },
  { title: "SUBLIMAÇÃO TÊXTIL", product: "Sublimatica K2008TX PRO 8 i3200", estimated_value: 319000 },
  { title: "COMUNICAÇÃO VISUAL", product: "Mesa Plana UV K1810UV 4 Ricoh G6", estimated_value: 349990 },
  { title: "COMUNICAÇÃO VISUAL", product: "Mesa Plana UV K2513UV 4 Ricoh G6", estimated_value: 369990 },
  { title: "COMUNICAÇÃO VISUAL", product: "Mesa Plana UV K2513UV 6 Ricoh G6", estimated_value: 399990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte T-24", estimated_value: 5490 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte T-48 - Motor de Passo", estimated_value: 6990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte T-48 - Motor Servo", estimated_value: 9990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte T-59 - Motor Servo", estimated_value: 12990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Auto Cutter Z Pro Max", estimated_value: 16990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Auto Cutter LN05", estimated_value: 25990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Auto Cutter LN06", estimated_value: 34990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Roll Cutter", estimated_value: 39990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Mesa de Corte 7090E", estimated_value: 49990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Mesa de Corte 7090U", estimated_value: 54990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "MapCut 6040", estimated_value: 149900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "MapCut 8060", estimated_value: 169900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "MapCut 1815", estimated_value: 329900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "MapCut 2513", estimated_value: 429900 },
  { title: "PRODUÇÃO COLOR", product: "Canon imagePRESS V700", estimated_value: 125900 },
  { title: "PRODUÇÃO COLOR", product: "Canon imagePRESS V700 + POD", estimated_value: 149900 },
  { title: "PRODUÇÃO MONO", product: "Canon varioPRINT 120/130/140 nova", estimated_value: 430000 },
  { title: "PRODUÇÃO MONO", product: "Canon varioPRINT 120/130/140 semi-nova", estimated_value: 140000 },
  { title: "PRODUÇÃO MONO", product: "Canon imageRUNNER 6555 semi-nova", estimated_value: 34000 },
  { title: "OFFICE COLOR", product: "Canon imageRUNNER C3926 com pedestal", estimated_value: 26300 }
];

const SUBCATEGORY_TYPE_MAP = Object.fromEntries([
  ...EQUIPMENT_SUBCATEGORIES.map((subcategory) => [subcategory, "equipment"]),
  ...SUPPLIES_SUBCATEGORIES.map((subcategory) => [subcategory, "supplies"]),
  ...SERVICE_SUBCATEGORIES.map((subcategory) => [subcategory, "service"])
]);

function normalizeTitlePart(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeLookupKey(value) {
  return normalizeTitlePart(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

const SUBCATEGORY_CANONICAL_BY_KEY = (() => {
  const map = OPPORTUNITY_SUBCATEGORIES.reduce((acc, subcategory) => {
    acc[normalizeLookupKey(subcategory)] = subcategory;
    return acc;
  }, {});

  // Compatibilidade com histórico salvo sem acento.
  map[normalizeLookupKey("SUBLIMAÇÃO TEXTIL")] = "SUBLIMAÇÃO TÊXTIL";
  return map;
})();

function canonicalizeSubcategory(value) {
  const normalizedValue = normalizeTitlePart(value);
  if (!normalizedValue) return "";
  return SUBCATEGORY_CANONICAL_BY_KEY[normalizeLookupKey(normalizedValue)] || normalizedValue;
}

export const PRODUCTS_BY_SUBCATEGORY = PRODUCT_CATALOG_ROWS.reduce(
  (acc, row) => {
    const canonicalTitle = canonicalizeSubcategory(row.title);
    if (!acc[canonicalTitle]) acc[canonicalTitle] = [];
    if (!acc[canonicalTitle].includes(row.product)) {
      acc[canonicalTitle].push(row.product);
    }
    return acc;
  },
  Object.fromEntries(OPPORTUNITY_SUBCATEGORIES.map((subcategory) => [subcategory, []]))
);

export const PRODUCT_PRICE_CATALOG = PRODUCT_CATALOG_ROWS.reduce((acc, row) => {
  const canonicalTitle = canonicalizeSubcategory(row.title);
  if (!acc[canonicalTitle]) acc[canonicalTitle] = {};
  acc[canonicalTitle][row.product] = row.estimated_value;
  return acc;
}, {});

function normalizeTypeLabel(value) {
  return normalizeLookupKey(value);
}

const TYPE_LABEL_TO_VALUE = SALES_TYPES.reduce((acc, type) => {
  acc[normalizeTypeLabel(type.label)] = type.value;
  acc[normalizeTypeLabel(type.value)] = type.value;
  return acc;
}, {});

const OPPORTUNITY_ITEMS_SEPARATOR = " || ";

export function getSubcategoriesByType(typeValue) {
  const requestedType = normalizeTitlePart(typeValue).toLowerCase();
  return OPPORTUNITY_SUBCATEGORIES.filter((subcategory) => {
    const categoryType = SUBCATEGORY_TYPE_MAP[subcategory] || "equipment";
    return categoryType === requestedType;
  });
}

export function composeOpportunityTitle(titleSubcategory, titleProduct) {
  const category = canonicalizeSubcategory(titleSubcategory);
  const product = normalizeTitlePart(titleProduct);
  if (!category) return "";
  if (!product) return category;
  return `${category} > ${product}`;
}

function parseSingleOpportunityTitle(rawTitle) {
  const normalized = normalizeTitlePart(rawTitle);
  if (!normalized) {
    return { opportunity_type: "equipment", title_subcategory: "", title_product: "" };
  }

  const parts = normalized
    .split(">")
    .map((part) => normalizeTitlePart(part))
    .filter(Boolean);

  let opportunityType = "equipment";
  let titleSubcategory = "";
  let titleProduct = "";

  if (parts.length >= 3) {
    const parsedType = TYPE_LABEL_TO_VALUE[normalizeTypeLabel(parts[0])] || "";
    if (parsedType) {
      opportunityType = parsedType;
      titleSubcategory = canonicalizeSubcategory(parts[1]);
      titleProduct = parts.slice(2).join(" > ");
    } else {
      titleSubcategory = canonicalizeSubcategory(parts[0]);
      titleProduct = parts.slice(1).join(" > ");
    }
  } else if (parts.length === 2) {
    titleSubcategory = canonicalizeSubcategory(parts[0]);
    titleProduct = parts[1];
  } else {
    const maybeSubcategory = canonicalizeSubcategory(parts[0]);
    if (SUBCATEGORY_TYPE_MAP[maybeSubcategory]) {
      titleSubcategory = maybeSubcategory;
    } else {
      titleProduct = parts[0];
    }
  }

  if (titleSubcategory) {
    opportunityType = SUBCATEGORY_TYPE_MAP[titleSubcategory] || opportunityType;
  }

  return { opportunity_type: opportunityType, title_subcategory: titleSubcategory, title_product: titleProduct };
}

export function parseOpportunityItems(rawTitle) {
  const normalized = normalizeTitlePart(rawTitle);
  if (!normalized) return [];

  const segments = normalized
    .split("||")
    .map((segment) => normalizeTitlePart(segment))
    .filter(Boolean);

  if (!segments.length) return [];

  return segments
    .map((segment) => parseSingleOpportunityTitle(segment))
    .filter((item) => item.title_subcategory || item.title_product);
}

export function composeOpportunityTitleFromItems(items = []) {
  const normalizedItems = (items || [])
    .map((item) => ({
      title_subcategory: canonicalizeSubcategory(item?.title_subcategory),
      title_product: normalizeTitlePart(item?.title_product)
    }))
    .filter((item) => item.title_subcategory && item.title_product);

  if (!normalizedItems.length) return "";
  return normalizedItems
    .map((item) => composeOpportunityTitle(item.title_subcategory, item.title_product))
    .filter(Boolean)
    .join(OPPORTUNITY_ITEMS_SEPARATOR);
}

export function parseOpportunityTitle(rawTitle) {
  const items = parseOpportunityItems(rawTitle);
  if (!items.length) {
    return { opportunity_type: "equipment", title_subcategory: "", title_product: "" };
  }
  return items[0];
}

export function resolveEstimatedValueByProduct(titleSubcategory, titleProduct) {
  const category = canonicalizeSubcategory(titleSubcategory);
  const product = normalizeTitlePart(titleProduct);
  if (!category || !product) return null;

  const rawValue = PRODUCT_PRICE_CATALOG?.[category]?.[product];
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) return null;
  return numericValue;
}
