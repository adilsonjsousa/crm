import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function safeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeMultilineText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function formatCurrencyBr(value) {
  return CURRENCY_FORMATTER.format(parseNumber(value, 0));
}

function normalizeQuantity(value) {
  const parsed = parseNumber(value, 1);
  return parsed > 0 ? parsed : 1;
}

function normalizeDiscount(value) {
  const parsed = parseNumber(value, 0);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

function normalizeExportItems(items = []) {
  return (items || []).map((entry, index) => {
    const quantity = normalizeQuantity(entry?.quantity);
    const unitPrice = parseNumber(entry?.unit_price, 0);
    const discount = normalizeDiscount(entry?.discount_percent);
    const subtotal = Math.max(0, quantity * unitPrice * (1 - discount / 100));

    return {
      index: index + 1,
      description: safeText(entry?.item_description || entry?.title_product || entry?.product || "Item"),
      quantity,
      unitPrice,
      discount,
      subtotal,
      quantityLabel: quantity.toLocaleString("pt-BR"),
      unitPriceLabel: formatCurrencyBr(unitPrice),
      discountLabel: discount > 0 ? `${discount.toLocaleString("pt-BR")} %` : "-",
      subtotalLabel: formatCurrencyBr(subtotal)
    };
  });
}

function getItemsTotal(items = []) {
  return normalizeExportItems(items).reduce((acc, item) => acc + item.subtotal, 0);
}

function parseImageDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    base64: match[2]
  };
}

function decodeBase64(base64) {
  if (!base64) return null;
  if (typeof atob !== "function") return null;

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function inferPdfImageFormat(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("png")) return "PNG";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "JPEG";
  return "";
}

function docxTextCell(value, { bold = false, align = AlignmentType.LEFT, shade = "" } = {}) {
  return new TableCell({
    verticalAlign: "center",
    shading: shade ? { fill: shade } : undefined,
    margins: {
      top: 90,
      bottom: 90,
      left: 110,
      right: 110
    },
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: safeText(value),
            bold
          })
        ]
      })
    ]
  });
}

function buildDocxItemsTable(items = []) {
  const normalizedItems = normalizeExportItems(items);
  const header = new TableRow({
    tableHeader: true,
    children: [
      docxTextCell("#", { bold: true, shade: "EEE8FF", align: AlignmentType.CENTER }),
      docxTextCell("Produto ou servico", { bold: true, shade: "EEE8FF" }),
      docxTextCell("Qtd.", { bold: true, shade: "EEE8FF", align: AlignmentType.RIGHT }),
      docxTextCell("Preco unit.", { bold: true, shade: "EEE8FF", align: AlignmentType.RIGHT }),
      docxTextCell("Desconto", { bold: true, shade: "EEE8FF", align: AlignmentType.RIGHT }),
      docxTextCell("Sub-total", { bold: true, shade: "EEE8FF", align: AlignmentType.RIGHT })
    ]
  });

  const rows = normalizedItems.map((item) =>
    new TableRow({
      children: [
        docxTextCell(String(item.index), { align: AlignmentType.CENTER }),
        docxTextCell(item.description),
        docxTextCell(item.quantityLabel, { align: AlignmentType.RIGHT }),
        docxTextCell(item.unitPriceLabel, { align: AlignmentType.RIGHT }),
        docxTextCell(item.discountLabel, { align: AlignmentType.RIGHT }),
        docxTextCell(item.subtotalLabel, { align: AlignmentType.RIGHT })
      ]
    })
  );

  const totalLabel = formatCurrencyBr(getItemsTotal(items));
  const totalRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 5,
        shading: { fill: "F4F1FF" },
        margins: {
          top: 90,
          bottom: 90,
          left: 110,
          right: 110
        },
        children: [new Paragraph({ children: [new TextRun({ text: "Valor total do pedido", bold: true })] })]
      }),
      docxTextCell(totalLabel, { bold: true, align: AlignmentType.RIGHT, shade: "F4F1FF" })
    ]
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      bottom: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      left: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      right: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, color: "E4E7F2", size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, color: "E4E7F2", size: 1 }
    },
    rows: [header, ...rows, totalRow]
  });
}

function createMetaTable({ issueDate, validityDays, proposalNumber }) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      bottom: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      left: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      right: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 }
    },
    rows: [
      new TableRow({
        children: [
          docxTextCell("Data de emissao", { bold: true, shade: "F7F4FF" }),
          docxTextCell("Validade", { bold: true, shade: "F7F4FF" }),
          docxTextCell("Documento", { bold: true, shade: "F7F4FF" })
        ]
      }),
      new TableRow({
        children: [
          docxTextCell(issueDate),
          docxTextCell(`${safeText(validityDays)} dias`),
          docxTextCell(proposalNumber)
        ]
      })
    ]
  });
}

function createConditionsTable({ freightTerms, paymentTerms, deliveryTerms, validityDays }) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      bottom: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      left: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      right: { style: BorderStyle.SINGLE, color: "D8DBEB", size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, color: "E4E7F2", size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, color: "E4E7F2", size: 1 }
    },
    rows: [
      new TableRow({
        children: [
          docxTextCell("Frete", { bold: true, shade: "F7F4FF" }),
          docxTextCell(freightTerms)
        ]
      }),
      new TableRow({
        children: [
          docxTextCell("Prazo de pagamento", { bold: true, shade: "F7F4FF" }),
          docxTextCell(paymentTerms)
        ]
      }),
      new TableRow({
        children: [
          docxTextCell("Prazo de entrega", { bold: true, shade: "F7F4FF" }),
          docxTextCell(deliveryTerms)
        ]
      }),
      new TableRow({
        children: [
          docxTextCell("Validade da proposta", { bold: true, shade: "F7F4FF" }),
          docxTextCell(`${safeText(validityDays)} dias`)
        ]
      })
    ]
  });
}

export async function buildProposalDocxBlob(payload = {}) {
  const proposalNumber = safeText(payload.proposalNumber, "Proposta Comercial");
  const companyName = safeText(payload.companyName, "Cliente");
  const issueDate = safeText(payload.issueDate, "-");
  const validityDays = safeText(payload.validityDays, "-");
  const freightTerms = safeText(payload.freightTerms, "-");
  const paymentTerms = safeText(payload.paymentTerms, "-");
  const deliveryTerms = safeText(payload.deliveryTerms, "-");
  const renderedText = normalizeMultilineText(payload.renderedText || "");
  const items = Array.isArray(payload.items) ? payload.items : [];

  const imageMeta = parseImageDataUrl(payload.logoDataUrl);
  const imageData = imageMeta ? decodeBase64(imageMeta.base64) : null;

  const children = [];

  if (imageData) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 120 },
        children: [
          new ImageRun({
            data: imageData,
            transformation: { width: 250, height: 72 }
          })
        ]
      })
    );
  }

  children.push(
    new Paragraph({
      text: proposalNumber,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 }
    }),
    new Paragraph({
      text: companyName,
      spacing: { after: 220 }
    }),
    createMetaTable({ issueDate, validityDays, proposalNumber }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Condicoes gerais", heading: HeadingLevel.HEADING_3 }),
    createConditionsTable({ freightTerms, paymentTerms, deliveryTerms, validityDays }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Itens da oportunidade", heading: HeadingLevel.HEADING_3 }),
    buildDocxItemsTable(items),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Texto da proposta", heading: HeadingLevel.HEADING_3 })
  );

  const textLines = renderedText.split("\n");
  if (!textLines.length) {
    children.push(new Paragraph({ text: "-" }));
  } else {
    for (const line of textLines) {
      children.push(new Paragraph({ text: line || " " }));
    }
  }

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1000,
              right: 900,
              bottom: 1000,
              left: 900
            }
          }
        },
        children
      }
    ]
  });

  return Packer.toBlob(document);
}

function drawPdfHeader(doc, payload, margin, cursorY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = cursorY;
  const imageMeta = parseImageDataUrl(payload.logoDataUrl);
  if (imageMeta) {
    const format = inferPdfImageFormat(imageMeta.mimeType);
    if (format) {
      try {
        doc.addImage(payload.logoDataUrl, format, margin, y, 190, 54);
        y += 62;
      } catch {
        // ignore invalid image payload
      }
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(24, 26, 34);
  doc.text(safeText(payload.proposalNumber, "Proposta Comercial"), margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(70, 70, 82);
  doc.text(safeText(payload.companyName, "Cliente"), margin, y);

  const metaTop = y + 14;
  const metaWidth = (pageWidth - margin * 2 - 12) / 3;
  const fields = [
    { label: "Data de emissao", value: safeText(payload.issueDate, "-") },
    { label: "Validade", value: `${safeText(payload.validityDays, "-")} dias` },
    { label: "Documento", value: safeText(payload.proposalNumber, "Proposta Comercial") }
  ];

  fields.forEach((field, index) => {
    const x = margin + index * (metaWidth + 6);
    doc.setDrawColor(216, 219, 235);
    doc.setFillColor(248, 245, 255);
    doc.roundedRect(x, metaTop, metaWidth, 46, 5, 5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(91, 33, 182);
    doc.text(field.label.toUpperCase(), x + 8, metaTop + 13);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(32, 35, 45);
    doc.text(field.value, x + 8, metaTop + 29);
  });

  return metaTop + 58;
}

function writePdfTextWithPaging(doc, lines, { margin = 42, startY = 42, lineHeight = 13, bottomMargin = 44 } = {}) {
  const maxY = doc.internal.pageSize.getHeight() - bottomMargin;
  let y = startY;

  for (const line of lines) {
    if (y > maxY) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }

  return y;
}

export function buildProposalPdfBlob(payload = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();

  let cursorY = drawPdfHeader(doc, payload, margin, 34);
  cursorY += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(91, 33, 182);
  doc.text("Condicoes gerais", margin, cursorY);

  cursorY += 8;
  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 4
    },
    headStyles: {
      fillColor: [247, 244, 255],
      textColor: [91, 33, 182]
    },
    bodyStyles: {
      textColor: [35, 39, 49]
    },
    columnStyles: {
      0: { cellWidth: (pageWidth - margin * 2) * 0.28, fontStyle: "bold" },
      1: { cellWidth: (pageWidth - margin * 2) * 0.72 }
    },
    body: [
      ["Frete", safeText(payload.freightTerms, "-")],
      ["Prazo de pagamento", safeText(payload.paymentTerms, "-")],
      ["Prazo de entrega", safeText(payload.deliveryTerms, "-")],
      ["Validade da proposta", `${safeText(payload.validityDays, "-")} dias`]
    ],
    theme: "grid"
  });

  cursorY = (doc.lastAutoTable?.finalY || cursorY) + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(91, 33, 182);
  doc.text("Itens da oportunidade", margin, cursorY);

  const normalizedItems = normalizeExportItems(payload.items || []);
  autoTable(doc, {
    startY: cursorY + 8,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8.7,
      cellPadding: 4
    },
    headStyles: {
      fillColor: [237, 232, 255],
      textColor: [91, 33, 182]
    },
    bodyStyles: {
      textColor: [35, 39, 49]
    },
    footStyles: {
      fillColor: [244, 241, 255],
      textColor: [35, 39, 49],
      fontStyle: "bold"
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 24 },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 48 },
      3: { halign: "right", cellWidth: 72 },
      4: { halign: "right", cellWidth: 56 },
      5: { halign: "right", cellWidth: 72 }
    },
    head: [["#", "Produto ou servico", "Qtd.", "Preco unit.", "Desc.", "Sub-total"]],
    body: normalizedItems.map((item) => [
      String(item.index),
      item.description,
      item.quantityLabel,
      item.unitPriceLabel,
      item.discountLabel,
      item.subtotalLabel
    ]),
    foot: [["", "Valor total do pedido", "", "", "", formatCurrencyBr(getItemsTotal(payload.items || []))]],
    theme: "grid"
  });

  cursorY = (doc.lastAutoTable?.finalY || cursorY) + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(91, 33, 182);
  doc.text("Texto da proposta", margin, cursorY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(35, 39, 49);

  const proposalText = normalizeMultilineText(payload.renderedText || "-");
  const wrapped = doc.splitTextToSize(proposalText, pageWidth - margin * 2);
  writePdfTextWithPaging(doc, wrapped, {
    margin,
    startY: cursorY + 14,
    lineHeight: 13,
    bottomMargin: 44
  });

  return doc.output("blob");
}
