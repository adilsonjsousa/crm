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
      detail: String(entry?.item_detail || entry?.detail || ""),
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
      insideHorizontal: { style: BorderStyle.SINGLE, color: "E4E7F2", size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, color: "E4E7F2", size: 1 }
    },
    rows: [
      new TableRow({
        children: [
          docxTextCell("DATA DE EMISSAO", { bold: true, shade: "F7F4FF" }),
          docxTextCell("VALIDADE", { bold: true, shade: "F7F4FF" }),
          docxTextCell("DOCUMENTO", { bold: true, shade: "F7F4FF" })
        ]
      }),
      new TableRow({
        children: [
          docxTextCell(issueDate),
          docxTextCell(`${validityDays} dias`),
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

  for (const paragraph of renderedText.split("\n")) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: paragraph })]
      })
    );
  }

  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: "Atenciosamente,", italics: true })] }),
    new Paragraph({
      children: [new TextRun({ text: "Equipe ArtPrinter", bold: true })]
    })
  );

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children
      }
    ]
  });

  return Packer.toBlob(document);
}

function formatCnpjMask(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return value || "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatDateBr(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  return raw;
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

function ensurePdfSpace(doc, cursorY, needed, margin) {
  const maxY = doc.internal.pageSize.getHeight() - 44;
  if (cursorY + needed > maxY) {
    doc.addPage();
    return margin;
  }
  return cursorY;
}

function inferPdfImageFormat(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("png")) return "PNG";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "JPEG";
  return "";
}

function cleanRenderedTextForPdf(text) {
  let cleaned = String(text || "");
  cleaned = cleaned.replace(/^PROPOSTA\s+COMERCIAL\s*/i, "");
  cleaned = cleaned.replace(/\nPROPOSTA\s+COMERCIAL\s*/i, "\n");
  const lines = cleaned.split("\n");
  const endIdx = lines.length - 1;
  for (let i = endIdx; i >= Math.max(0, endIdx - 5); i--) {
    const trimmed = lines[i].trim().toLowerCase();
    if (trimmed === "atenciosamente," || trimmed === "equipe artprinter" || trimmed === "equipe comercial artprinter" || trimmed === "equipe comercial") {
      lines[i] = "";
    }
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join("\n").trim();
}

function drawPdfHeaderBar(doc, payload, margin) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const barHeight = 36;
  const barY = 20;

  doc.setFillColor(248, 245, 255);
  doc.rect(0, barY, pageWidth, barHeight, "F");
  doc.setDrawColor(124, 58, 237);
  doc.setLineWidth(2);
  doc.line(0, barY + barHeight, pageWidth, barY + barHeight);

  const ownerPhone = safeText(payload.ownerPhone, "(47) 98431-0200").trim();
  const ownerEmail = safeText(payload.ownerEmail, "comercial@artprinter.com.br").trim();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 100);
  const contactY = barY + 22;
  doc.text(ownerPhone, margin + 6, contactY);

  const phoneWidth = doc.getTextWidth(ownerPhone);
  const webX = margin + 6 + phoneWidth + 30;
  doc.text("www.artprinter.com.br", webX, contactY);

  const webWidth = doc.getTextWidth("www.artprinter.com.br");
  const emailX = webX + webWidth + 30;
  doc.text(ownerEmail, emailX, contactY);

  const imageMeta = parseImageDataUrl(payload.logoDataUrl);
  if (imageMeta) {
    const format = inferPdfImageFormat(imageMeta.mimeType);
    if (format) {
      try {
        doc.addImage(payload.logoDataUrl, format, pageWidth - margin - 120, barY + 2, 115, 32);
      } catch {
        // ignore
      }
    }
  }

  return barY + barHeight + 24;
}

export function buildProposalPdfBlob(payload = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;

  let y = drawPdfHeaderBar(doc, payload, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(31, 41, 55);
  doc.text("PROPOSTA COMERCIAL", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  const issueDateFormatted = formatDateBr(payload.issueDate);
  const subtitle = `Nº ${safeText(payload.proposalNumber, "-")}  ·  ${issueDateFormatted}  ·  Validade: ${safeText(payload.validityDays, "-")} dias`;
  doc.text(subtitle, margin, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  doc.text(safeText(payload.companyName, "Cliente"), margin, y);
  y += 16;

  const cnpjFormatted = formatCnpjMask(payload.companyCnpj);
  if (cnpjFormatted) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text(`CNPJ: ${cnpjFormatted}`, margin, y);
    y += 14;
  }

  const contactName = safeText(payload.contactName, "").trim();
  if (contactName && contactName !== safeText(payload.companyName, "").trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    doc.text(`A/C: ${contactName}`, margin, y);
    y += 14;
  }

  y += 6;
  const proposalText = cleanRenderedTextForPdf(normalizeMultilineText(payload.renderedText || ""));
  if (proposalText.trim()) {
    const companyNameUpper = safeText(payload.companyName, "").toUpperCase().trim();
    let filteredText = proposalText;
    if (companyNameUpper) {
      filteredText = filteredText.replace(new RegExp("^" + companyNameUpper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\n?", "i"), "");
    }
    if (filteredText.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(31, 41, 55);
      const wrapped = doc.splitTextToSize(filteredText.trim(), contentWidth);
      y = writePdfTextWithPaging(doc, wrapped, {
        margin,
        startY: y,
        lineHeight: 13,
        bottomMargin: 44
      });
      y += 10;
    }
  }

  y = ensurePdfSpace(doc, y, 60, margin);

  const normalizedItems = normalizeExportItems(payload.items || []);
  const totalValue = getItemsTotal(payload.items || []);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 6, textColor: [31, 41, 55] },
    headStyles: { fillColor: [243, 240, 255], textColor: [91, 33, 182], fontStyle: "bold" },
    footStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.28, fontStyle: "bold" },
      1: { cellWidth: contentWidth * 0.50 },
      2: { halign: "right", cellWidth: contentWidth * 0.22 }
    },
    head: [["PRODUTO", "DESCRIÇÃO", "INVESTIMENTO"]],
    body: normalizedItems.map((item) => {
      const nameParts = String(item.description || "").split(" - ");
      const productName = nameParts.length > 1 ? nameParts.slice(1).join(" - ").trim() : item.description;
      const descParts = [];
      const detailText = safeText(item.detail, "").trim();
      if (detailText) {
        descParts.push(detailText.replace(/\\n/g, "\n"));
      }
      if (item.quantity > 1) descParts.push(`Qtd: ${item.quantityLabel}`);
      if (item.discount > 0) descParts.push(`Desconto: ${item.discountLabel}`);
      const descCol = descParts.join("\n") || (productName !== item.description ? item.description : "");
      return [productName, descCol, item.subtotalLabel];
    }),
    foot: [["", "TOTAL DO INVESTIMENTO:", formatCurrencyBr(totalValue)]],
    theme: "grid"
  });

  y = (doc.lastAutoTable?.finalY || y) + 22;
  y = ensurePdfSpace(doc, y, 120, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(31, 41, 55);
  doc.text("CONDIÇÕES COMERCIAIS", margin, y);
  y += 10;

  const conditionsBody = [
    ["Prazo de Pagamento", safeText(payload.paymentTerms, "-").replace(/\\n/g, "\n")],
    ["Frete", safeText(payload.freightTerms, "-")],
    ["Prazo de entrega", safeText(payload.deliveryTerms, "-")],
    ["Validade da proposta", `${safeText(payload.validityDays, "-")} dias`]
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 6, textColor: [31, 41, 55] },
    headStyles: { fillColor: [243, 240, 255], textColor: [91, 33, 182] },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.28, fontStyle: "bold", textColor: [91, 33, 182] },
      1: { cellWidth: contentWidth * 0.72 }
    },
    body: conditionsBody,
    theme: "grid"
  });

  y = (doc.lastAutoTable?.finalY || y) + 18;
  y = ensurePdfSpace(doc, y, 80, margin);

  const observationBullets = [];
  const warranty = safeText(payload.warrantyTerms, "").trim();
  const included = safeText(payload.includedOffer, "").trim();
  const excluded = safeText(payload.excludedOffer, "").trim();

  if (included) {
    included.replace(/\\n/g, "\n").split("\n").forEach((line) => { if (line.trim()) observationBullets.push(line.trim()); });
  }
  if (warranty) {
    warranty.replace(/\\n/g, "\n").split("\n").forEach((line) => { if (line.trim()) observationBullets.push(line.trim()); });
  }
  if (excluded) {
    excluded.replace(/\\n/g, "\n").split("\n").forEach((line) => { if (line.trim()) observationBullets.push(line.trim()); });
  }

  if (observationBullets.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(31, 41, 55);
    doc.text("OBSERVAÇÕES", margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(55, 65, 81);
    for (const bullet of observationBullets) {
      y = ensurePdfSpace(doc, y, 14, margin);
      const bulletWrapped = doc.splitTextToSize(`• ${bullet}`, contentWidth - 10);
      for (const bLine of bulletWrapped) {
        doc.text(bLine, margin + 6, y);
        y += 13;
      }
    }
    y += 8;
  }

  const closingText = safeText(payload.closingText, "").trim();
  const financingTerms = safeText(payload.financingTerms, "").trim();
  if (closingText || financingTerms) {
    y = ensurePdfSpace(doc, y, 60, margin);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(31, 41, 55);
    doc.text("CONDIÇÕES DE FECHAMENTO", margin, y);
    y += 10;

    const closingBody = [];
    if (closingText) closingBody.push(["Prazo de Pagamento", closingText.replace(/\\n/g, "\n")]);
    if (financingTerms) closingBody.push(["Financiamento", financingTerms.replace(/\\n/g, "\n")]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 6, textColor: [31, 41, 55] },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.28, fontStyle: "bold", textColor: [91, 33, 182] },
        1: { cellWidth: contentWidth * 0.72 }
      },
      body: closingBody,
      theme: "grid"
    });
    y = (doc.lastAutoTable?.finalY || y) + 20;
  }

  y = ensurePdfSpace(doc, y, 50, margin);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text("Atenciosamente,", margin, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);
  const ownerName = safeText(payload.ownerName, "").trim();
  if (ownerName) {
    doc.text(ownerName, margin, y);
    y += 14;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text("Equipe Comercial ArtPrinter", margin, y);

  return doc.output("blob");
}
