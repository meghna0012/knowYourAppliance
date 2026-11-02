import path from "path";
import sharp from "sharp";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { requestDiagnosis, DiagnosisError } from "./aiService.js";
import { boundedInt, calendarDate, parseTermMonths } from "./documentRecords.js";

export { DiagnosisError };

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const KINDS = new Set(["sticker", "manual", "bill", "warranty", "service", "condition", "other"]);
const COVERAGE_TYPES = new Set(["manufacturer", "extended", "retailer", "unknown"]);
const SEVERITIES = new Set(["none", "minor", "moderate", "urgent"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

// Only flag what is actually dangerous to keep using. A manual that mentions
// "electric shock" as a warning must not mark the appliance unsafe.
const HAZARD =
  /\b(fire|smoke|sparks?|scorch(?:ed|ing)?|melted|exposed wires?|gas leak|smell of gas|electrocution|electric shock|arcing|burning)\b/i;

const TEXT_CHAR_LIMIT = 12000;
const EXCERPT_LIMIT = 8000;
const VISION_PAGES = 3;

export function clipText(value, max, { keepBreaks = false } = {}) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  let text = String(value).replace(/\r\n/g, "\n").trim();
  text = keepBreaks
    ? text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
    : text.replace(/\s+/g, " ");
  if (!text) return undefined;
  return text.slice(0, max);
}

export function safeOriginalName(name) {
  const base = path
    .basename(String(name || "upload"))
    .replace(/[^\w.\- ()[\]]+/g, "")
    .trim()
    .slice(0, 180);
  return base || "upload";
}

export function allowedMime(value) {
  return ALLOWED_MIME.has(value) ? value : undefined;
}

export function sniffUpload(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", ext: ".jpg", kind: "image" };
  }
  if (buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { mimeType: "image/png", ext: ".png", kind: "image" };
  }
  const head = buffer.toString("ascii", 0, 12);
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) {
    return { mimeType: "image/gif", ext: ".gif", kind: "image" };
  }
  if (head.startsWith("RIFF") && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mimeType: "image/webp", ext: ".webp", kind: "image" };
  }
  if (head.startsWith("%PDF-")) {
    return { mimeType: "application/pdf", ext: ".pdf", kind: "pdf" };
  }
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    const heif = ["heic", "heix", "hevc", "heif", "mif1", "msf1", "heim", "heis"];
    if (heif.includes(brand)) {
      return { mimeType: "image/heic", ext: ".heic", kind: "image" };
    }
  }
  return null;
}

function compact(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

function clipList(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clipText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeDiagnosis(raw, { pageNote, excerpt } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DiagnosisError("The reader returned something we couldn't use. Try the upload again.");
  }

  const kind = KINDS.has(raw.kind) ? raw.kind : "other";
  const summary = clipText(raw.summary, 600) || "Nothing useful could be read from this file.";

  const identification = compact({
    brand: clipText(raw.identification?.brand, 80),
    modelNumber: clipText(raw.identification?.modelNumber, 80),
    serialNumber: clipText(raw.identification?.serialNumber, 80),
    generation: clipText(raw.identification?.generation, 80),
    applianceType: clipText(raw.identification?.applianceType, 80),
  });

  const legacyWarranty = clipText(raw.bill?.warranty, 160);
  const currency = clipText(raw.bill?.currency, 8);
  const bill = compact({
    retailer: clipText(raw.bill?.retailer, 120),
    purchaseDate: calendarDate(raw.bill?.purchaseDate),
    price: clipText(raw.bill?.price, 40),
    currency: currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : undefined,
    invoiceNumber: clipText(raw.bill?.invoiceNumber, 40),
    warranty: legacyWarranty,
  });

  let termMonths = parseTermMonths(raw.warranty?.termMonths) || parseTermMonths(legacyWarranty);
  const coverageTerm = parseTermMonths(raw.warranty?.coverage);
  if (termMonths && coverageTerm && termMonths < 12 && coverageTerm === termMonths * 12) {
    termMonths = coverageTerm;
  }
  const warrantyStart = calendarDate(raw.warranty?.startDate);
  let warrantyEnd = calendarDate(raw.warranty?.endDate);
  if (warrantyStart && warrantyEnd && warrantyEnd < warrantyStart) warrantyEnd = undefined;
  const renewalDate = calendarDate(raw.warranty?.renewalDate);
  const warranty = compact({
    provider: clipText(raw.warranty?.provider, 120),
    coverageType: COVERAGE_TYPES.has(raw.warranty?.coverageType) ? raw.warranty.coverageType : undefined,
    termMonths,
    startDate: warrantyStart,
    endDate: warrantyEnd,
    coverage: clipText(raw.warranty?.coverage, 240),
    renewable: typeof raw.warranty?.renewable === "boolean" ? raw.warranty.renewable : undefined,
    renewalDate: renewalDate && (!warrantyStart || renewalDate >= warrantyStart) ? renewalDate : undefined,
  });

  const maintenance = [];
  if (Array.isArray(raw.maintenance)) {
    for (const item of raw.maintenance) {
      if (!item || typeof item !== "object") continue;
      const task = clipText(item.task, 120);
      if (!task) continue;
      let months = boundedInt(item.intervalMonths, 1, 240);
      let days = boundedInt(item.intervalDays, 1, 3650);
      if (months && days) {
        if (days < 28) months = undefined;
        else days = undefined;
      }
      const lastDone = calendarDate(item.lastDone);
      let nextDue = calendarDate(item.nextDue);
      if (lastDone && nextDue && nextDue < lastDone) nextDue = undefined;
      maintenance.push(compact({ task, intervalMonths: months, intervalDays: days, lastDone, nextDue }));
      if (maintenance.length === 8) break;
    }
  }

  const observations = clipList(raw.condition?.observations, 6, 240);
  const issues = clipList(raw.condition?.issues, 6, 240);
  let severity = SEVERITIES.has(raw.condition?.severity) ? raw.condition.severity : "none";
  let safeToUse =
    typeof raw.condition?.safeToUse === "boolean" ? raw.condition.safeToUse : undefined;
  let advice = clipText(raw.condition?.advice, 400);

  const hazardSource = [summary, advice, ...observations, ...issues].filter(Boolean).join(" ");
  if ((kind === "condition" || kind === "other") && HAZARD.test(hazardSource)) {
    severity = "urgent";
    safeToUse = false;
    advice =
      advice ||
      "Stop using it and get a qualified technician to check it before you turn it on again.";
  }

  const condition =
    observations.length || issues.length || advice || severity !== "none"
      ? compact({
          observations,
          issues,
          severity,
          safeToUse: safeToUse === false ? false : undefined,
          advice,
        })
      : undefined;

  const keyPoints = clipList(raw.manual?.keyPoints, 8, 240);
  const topic = clipText(raw.manual?.topic, 120);
  const manual = topic || keyPoints.length ? compact({ topic, keyPoints }) : undefined;

  const unreadable = clipList(raw.unreadable, 8, 160);
  if (pageNote && !unreadable.includes(pageNote)) unreadable.push(pageNote);
  const missedDates = [
    [raw.bill?.purchaseDate, bill.purchaseDate, "purchase date"],
    [raw.warranty?.startDate, warranty.startDate, "warranty start"],
    [raw.warranty?.endDate, warranty.endDate, "warranty end"],
    [raw.warranty?.renewalDate, warranty.renewalDate, "renewal date"],
  ];
  for (const [rawValue, parsed, label] of missedDates) {
    if (clipText(rawValue, 40) && !parsed && !unreadable.includes(label)) unreadable.push(label);
  }

  const storedExcerpt = clipText(excerpt, EXCERPT_LIMIT, { keepBreaks: true })
    || clipText(raw.excerpt, 4000, { keepBreaks: true });

  return compact({
    kind,
    confidence: CONFIDENCE.has(raw.confidence) ? raw.confidence : "medium",
    summary,
    identification: Object.keys(identification).length ? identification : undefined,
    bill: Object.keys(bill).length ? bill : undefined,
    warranty: Object.keys(warranty).length ? warranty : undefined,
    maintenance: maintenance.length ? maintenance : undefined,
    condition,
    manual,
    unreadable,
    excerpt: storedExcerpt,
  });
}

async function toModelJpeg(buffer) {
  try {
    const out = await sharp(buffer, { failOn: "none", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    if (!out?.length) throw new Error("empty image");
    return out;
  } catch (err) {
    console.error("image transcode failed", err.message);
    throw new DiagnosisError(
      "Couldn't read that image. Export it as a JPEG or PNG and try again.",
      422
    );
  }
}

async function prepareImage(buffer) {
  const jpeg = await toModelJpeg(buffer);
  return { mode: "images", images: [{ buffer: jpeg, mimeType: "image/jpeg" }], pageNote: null, excerpt: null };
}

async function preparePdf(buffer) {
  const data = new Uint8Array(buffer);
  let pdf;
  try {
    pdf = await getDocumentProxy(data);
  } catch (err) {
    console.error("pdf open failed", err.message);
    throw new DiagnosisError(
      "Couldn't open that PDF. It may be damaged or password-protected.",
      422
    );
  }

  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text])
      .map((page) => String(page || "").replace(/[ \t]+\n/g, "\n").trim())
      .filter(Boolean);
    const combined = pages.join("\n\n");
    const readable = combined.replace(/[^A-Za-z0-9]/g, "");

    const asText = () => {
      const truncated = combined.length > TEXT_CHAR_LIMIT;
      return {
        mode: "text",
        text: combined.slice(0, TEXT_CHAR_LIMIT),
        images: [],
        excerpt: combined.slice(0, EXCERPT_LIMIT),
        pageNote: truncated
          ? `Only the start of this ${totalPages}-page document was read.`
          : null,
      };
    };

    if (readable.length >= 40) return asText();

    const limit = Math.min(totalPages || 1, VISION_PAGES);
    const images = [];
    for (let page = 1; page <= limit; page += 1) {
      try {
        const rendered = await renderPageAsImage(pdf, page, {
          canvasImport: () => import("@napi-rs/canvas"),
          width: 1400,
          format: "jpeg",
          quality: 0.8,
        });
        const jpeg = await toModelJpeg(Buffer.from(rendered));
        images.push({ buffer: jpeg, mimeType: "image/jpeg" });
      } catch (err) {
        console.error(`pdf page ${page} render failed`, err.message);
      }
    }

    if (!images.length) {
      if (readable.length >= 12) return asText();
      throw new DiagnosisError(
        "This PDF has no readable text, and its pages couldn't be rendered. Photograph the page instead.",
        422
      );
    }

    return {
      mode: "images",
      images,
      excerpt: readable.length >= 12 ? combined.slice(0, EXCERPT_LIMIT) : null,
      pageNote:
        totalPages > images.length
          ? `Only the first ${images.length} of ${totalPages} pages were read.`
          : null,
    };
  } finally {
    await pdf.destroy?.();
  }
}

// JPEG rendition for photos, original bytes for PDFs. No model call.
export async function prepareStoredFile(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!bytes.length) throw new DiagnosisError("That file is empty.", 400);
  const sniffed = sniffUpload(bytes);
  if (!sniffed) {
    throw new DiagnosisError("Upload a photo (JPEG, PNG, WebP, GIF, HEIC) or a PDF.", 400);
  }
  if (sniffed.kind === "pdf") {
    return { fileBuffer: bytes, mimeType: "application/pdf", extension: ".pdf" };
  }
  const jpeg = await toModelJpeg(bytes);
  return { fileBuffer: jpeg, mimeType: "image/jpeg", extension: ".jpg" };
}

// Reads any supported upload. Does not write to disk; the caller stores the file.
export async function diagnoseFile(buffer, appliance) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!bytes.length) throw new DiagnosisError("That file is empty.", 400);

  const sniffed = sniffUpload(bytes);
  if (!sniffed) {
    throw new DiagnosisError("Upload a photo (JPEG, PNG, WebP, GIF, HEIC) or a PDF.", 400);
  }

  const prepared = sniffed.kind === "pdf" ? await preparePdf(bytes) : await prepareImage(bytes);
  const raw = await requestDiagnosis({ prepared, appliance });
  const diagnosis = normalizeDiagnosis(raw, {
    pageNote: prepared.pageNote,
    excerpt: prepared.excerpt,
  });

  if (sniffed.kind === "pdf") {
    return { diagnosis, fileBuffer: bytes, mimeType: "application/pdf", extension: ".pdf" };
  }
  return {
    diagnosis,
    fileBuffer: prepared.images[0].buffer,
    mimeType: "image/jpeg",
    extension: ".jpg",
  };
}

function recordPreface(records) {
  if (!records) return "";
  const lines = [];
  const purchase = records.purchase || {};
  const purchaseBits = [
    purchase.purchaseDate && `purchased ${purchase.purchaseDate}`,
    purchase.retailer && `from ${purchase.retailer}`,
    purchase.price,
  ].filter(Boolean);
  if (purchaseBits.length) lines.push(`Purchase on file: ${purchaseBits.join(", ")}`);

  for (const warranty of records.warranties || []) {
    const bits = [
      warranty.coverageType && warranty.coverageType !== "unknown" ? warranty.coverageType : "warranty",
      warranty.provider,
      warranty.startDate && `from ${warranty.startDate}`,
      warranty.endDate && `until ${warranty.endDate}`,
      warranty.termMonths && `${warranty.termMonths} months`,
      warranty.renewable && warranty.renewalDate && `renew by ${warranty.renewalDate}`,
      warranty.coverage,
    ].filter(Boolean);
    if (bits.length) lines.push(`Warranty on file: ${bits.join(", ")}`);
  }

  for (const item of records.maintenance || []) {
    const bits = [
      item.task,
      item.intervalDays ? `every ${item.intervalDays} days` : item.intervalMonths ? `every ${item.intervalMonths} months` : "",
      item.lastDone && `last done ${item.lastDone}`,
      item.nextDue && `next due ${item.nextDue}`,
    ].filter(Boolean);
    lines.push(`Maintenance on file: ${bits.join(", ")}`);
  }
  return lines.join("\n");
}

export function buildUploadContext(uploads, records) {
  const blocks = (uploads || []).map((upload) => {
    const lines = [`${upload.kind} (${upload.originalName || "upload"}): ${upload.summary}`];
    const id = upload.identification || {};
    const idBits = [
      id.brand,
      id.modelNumber,
      id.serialNumber && `serial ${id.serialNumber}`,
      id.generation && `generation ${id.generation}`,
      id.applianceType && `type ${id.applianceType}`,
    ].filter(Boolean);
    if (idBits.length) lines.push(`Identification: ${idBits.join(", ")}`);

    const bill = upload.bill || {};
    const billBits = [bill.retailer, bill.purchaseDate, bill.price, bill.currency, bill.invoiceNumber, bill.warranty].filter(Boolean);
    if (billBits.length) lines.push(`Bill: ${billBits.join("; ")}`);

    const warranty = upload.warranty || {};
    const warrantyBits = [
      warranty.coverageType,
      warranty.provider,
      warranty.termMonths && `${warranty.termMonths} months`,
      warranty.startDate && `start ${warranty.startDate}`,
      warranty.endDate && `end ${warranty.endDate}`,
      warranty.renewalDate && `renew ${warranty.renewalDate}`,
      warranty.coverage,
    ].filter(Boolean);
    if (warrantyBits.length) lines.push(`Warranty: ${warrantyBits.join("; ")}`);

    if (upload.maintenance?.length) {
      const tasks = upload.maintenance.map((item) => {
        const when = [
          item.intervalDays ? `every ${item.intervalDays} days` : item.intervalMonths ? `every ${item.intervalMonths} months` : "",
          item.lastDone && `done ${item.lastDone}`,
          item.nextDue && `next ${item.nextDue}`,
        ].filter(Boolean);
        return [item.task, when.join(", ")].filter(Boolean).join(" (") + (when.length ? ")" : "");
      });
      lines.push(`Maintenance: ${tasks.join("; ")}`);
    }

    if (upload.condition?.issues?.length) {
      lines.push(`Issues (${upload.condition.severity || "noted"}): ${upload.condition.issues.join("; ")}`);
    }
    if (upload.condition?.advice) lines.push(`Advice: ${upload.condition.advice}`);
    if (upload.condition?.safeToUse === false) lines.push("Safe to use: no");
    if (upload.manual?.keyPoints?.length) {
      lines.push(`Manual (${upload.manual.topic || "notes"}): ${upload.manual.keyPoints.join("; ")}`);
    }
    if (upload.excerpt) lines.push(`Excerpt:\n${upload.excerpt}`);
    return lines.join("\n");
  });

  const selected = [];
  let size = 0;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    if (size + blocks[i].length > EXCERPT_LIMIT && selected.length) break;
    selected.push(blocks[i]);
    size += blocks[i].length;
  }
  const body = selected.reverse().join("\n\n");
  const preface = recordPreface(records);
  return [preface, body].filter(Boolean).join("\n\n");
}
