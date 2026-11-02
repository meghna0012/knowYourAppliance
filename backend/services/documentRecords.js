// Turns bill, warranty, service, and manual readings into one record per
// appliance. Reminders are derived from those dates on read, so a stored
// "due" flag can never go stale.

const COVERAGE_TYPES = new Set(["manufacturer", "extended", "retailer", "unknown"]);

const WARRANTY_LEAD_DAYS = 30;
const MAINTENANCE_LEAD_DAYS = 7;
export const REMINDER_LIST_DAYS = 90;

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatParts(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function fromParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return undefined;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return undefined;
  }
  return formatParts(y, m, d);
}

// Calendar day only. Reminders must not shift when the clock crosses UTC.
export function isoDate(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  return fromParts(match[1], match[2], match[3]);
}

// Written dates already stored on older bills ("15 March 2024").
// Slash dates stay unresolved: 03/04/2024 is not a day we can pick safely.
export function calendarDate(value) {
  const iso = isoDate(value);
  if (iso) return iso;
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/,/g, "").replace(/\s+/g, " ");
  let match = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) return fromParts(match[3], MONTHS[match[2].toLowerCase()], match[1]);
  match = text.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (match) return fromParts(match[3], MONTHS[match[1].toLowerCase()], match[2]);
  return undefined;
}

export function todayIso(now = new Date()) {
  return formatParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(iso, days) {
  const parsed = isoDate(iso);
  if (!parsed || !Number.isInteger(days)) return undefined;
  const [year, month, day] = parsed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// Anniversary, clamped to the last real day of the target month.
// 31 Jan + 1 month is 28 Feb, or 29 Feb in a leap year.
export function addMonths(iso, months) {
  const parsed = isoDate(iso);
  if (!parsed || !Number.isInteger(months)) return undefined;
  const [year, month, day] = parsed.split("-").map(Number);
  const shifted = month - 1 + months;
  const targetYear = year + Math.floor(shifted / 12);
  const targetMonth = ((shifted % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatParts(targetYear, targetMonth + 1, Math.min(day, lastDay));
}

export function boundedInt(value, min, max) {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

// "2 years" and "24 months" both become a month count. A bare number is
// already months. "Lifetime" has no end date, so it does not become a term.
export function parseTermMonths(value) {
  if (typeof value === "number") return boundedInt(value, 1, 240);
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  if (!text || /life/.test(text)) return undefined;
  if (/^\d{1,3}$/.test(text)) return boundedInt(Number(text), 1, 240);

  const monthsOnly = text.match(/^(\d{1,3})\s*(months?|mos?\.?)$/);
  if (monthsOnly) return boundedInt(Number(monthsOnly[1]), 1, 240);
  const yearsOnly = text.match(/^(\d{1,2})\s*(years?|yrs?\.?)$/);
  if (yearsOnly) return boundedInt(Number(yearsOnly[1]) * 12, 1, 240);

  const years = text.match(/(\d{1,2})\s*-?\s*(year|yr)/);
  const months = text.match(/(\d{1,3})\s*-?\s*(month|mo)/);
  if (years && !months) return boundedInt(Number(years[1]) * 12, 1, 240);
  if (months && !years) return boundedInt(Number(months[1]), 1, 240);
  return undefined;
}

export function taskKey(task) {
  return String(task || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|every|each)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value, max) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

function compact(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

function confidenceRank(value) {
  if (value === "high") return 3;
  if (value === "low") return 1;
  return 2;
}

function kindRank(kind) {
  if (kind === "warranty") return 3;
  if (kind === "bill") return 2;
  if (kind === "service") return 1;
  return 0;
}

function shift(iso, months, days) {
  if (days) return addDays(iso, days);
  if (months) return addMonths(iso, months);
  return undefined;
}

function descriptiveWarranty(text, termMonths) {
  const phrase = clip(text, 240);
  if (!phrase) return undefined;
  if (termMonths && /^(about\s+)?\d{1,3}\s*-?\s*(year|yr|month|mo)s?(\s+warranty)?\.?$/i.test(phrase)) {
    return undefined;
  }
  return phrase;
}

function warrantyFromUpload(upload) {
  const stated = upload.warranty || {};
  const legacyPhrase = clip(upload.bill?.warranty, 160);
  let termMonths = parseTermMonths(stated.termMonths) || parseTermMonths(legacyPhrase);
  const coverageTerm = parseTermMonths(stated.coverage);
  // A model that puts years in termMonths ("2") and the real length in the
  // coverage sentence ("2 year warranty") would otherwise expire in two months.
  if (termMonths && coverageTerm && termMonths < 12 && coverageTerm === termMonths * 12) {
    termMonths = coverageTerm;
  }

  const fromBill = upload.kind === "bill" || (!upload.kind && Boolean(upload.bill));
  let startDate = calendarDate(stated.startDate);
  if (!startDate && termMonths && fromBill) startDate = calendarDate(upload.bill?.purchaseDate);

  let endDate = calendarDate(stated.endDate);
  if (startDate && endDate && endDate < startDate) endDate = undefined;

  const provider = clip(stated.provider, 120);
  const coverage = clip(stated.coverage, 240) || descriptiveWarranty(legacyPhrase, termMonths);
  const renewable = stated.renewable === true ? true : stated.renewable === false ? false : undefined;
  let renewalDate = calendarDate(stated.renewalDate);
  if (renewalDate && startDate && renewalDate < startDate) renewalDate = undefined;

  const coverageType = COVERAGE_TYPES.has(stated.coverageType) ? stated.coverageType : undefined;
  const hasFact = Boolean(startDate || endDate || termMonths || provider || coverage || renewalDate || renewable === true);
  if (!hasFact) return null;

  return {
    provider,
    coverageType: coverageType || "unknown",
    termMonths,
    startDate,
    endDate,
    endDateCalculated: false,
    coverage,
    renewable,
    renewalDate,
    sourceUploadId: upload._id,
    _fromBill: fromBill,
    _confidence: confidenceRank(upload.confidence),
    _kindRank: kindRank(upload.kind),
  };
}

function compatibleCoverage(a, b) {
  return a.coverageType === b.coverageType || a.coverageType === "unknown" || b.coverageType === "unknown";
}

function sameWarranty(a, b) {
  if (!compatibleCoverage(a, b)) return false;
  if (a.endDate && b.endDate) return a.endDate === b.endDate;
  if (!a.endDate && !b.endDate && a.termMonths && a.termMonths === b.termMonths) {
    return (a.startDate || "") === (b.startDate || "");
  }
  if (a.startDate && b.startDate && a.termMonths && a.termMonths === b.termMonths) return true;
  return false;
}

function preferWarranty(primary, extra) {
  const merged = { ...primary };
  const fillingEnd = merged.endDate == null && extra.endDate != null;
  for (const key of ["provider", "coverage", "termMonths", "startDate", "endDate", "renewalDate"]) {
    if (merged[key] == null && extra[key] != null) merged[key] = extra[key];
  }
  if (fillingEnd) merged.endDateCalculated = Boolean(extra.endDateCalculated);
  if (merged.coverageType === "unknown" && extra.coverageType !== "unknown") {
    merged.coverageType = extra.coverageType;
  }
  if (extra.renewable === true) merged.renewable = true;
  if (merged._kindRank < extra._kindRank) merged.sourceUploadId = extra.sourceUploadId;
  return merged;
}

function resolveWarranty(fact, purchaseDate) {
  const next = { ...fact };
  const inheritStart =
    !next.startDate &&
    next.termMonths &&
    purchaseDate &&
    (next._fromBill || next.coverageType === "manufacturer");
  if (inheritStart) next.startDate = purchaseDate;

  if (!next.endDate && next.startDate && next.termMonths) {
    next.endDate = addMonths(next.startDate, next.termMonths);
    next.endDateCalculated = true;
  }
  if (next.startDate && next.endDate && next.endDate < next.startDate) {
    next.endDate = undefined;
    next.endDateCalculated = false;
  }
  if (next.renewable !== true) {
    next.renewable = undefined;
    next.renewalDate = undefined;
  } else if (!next.renewalDate && next.endDate) {
    next.renewalDate = next.endDate;
  }
  return next;
}

function purchaseFromUpload(upload) {
  if (upload.kind && upload.kind !== "bill") return null;
  const bill = upload.bill || {};
  const purchaseDate = calendarDate(bill.purchaseDate);
  const retailer = clip(bill.retailer, 120);
  const price = clip(bill.price, 40);
  const currency = clip(bill.currency, 8);
  const invoiceNumber = clip(bill.invoiceNumber, 40);
  if (!purchaseDate && !retailer && !price) return null;
  return {
    retailer,
    purchaseDate,
    price,
    currency: currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : undefined,
    invoiceNumber,
    sourceUploadId: upload._id,
    _confidence: confidenceRank(upload.confidence),
  };
}

function choosePurchase(uploads) {
  const candidates = uploads.map(purchaseFromUpload).filter(Boolean);
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => {
    const aDated = a.purchaseDate ? 1 : 0;
    const bDated = b.purchaseDate ? 1 : 0;
    if (aDated !== bDated) return bDated - aDated;
    if (a._confidence !== b._confidence) return b._confidence - a._confidence;
    if (a.purchaseDate && b.purchaseDate && a.purchaseDate !== b.purchaseDate) {
      return a.purchaseDate < b.purchaseDate ? -1 : 1;
    }
    return 0;
  });
  const best = candidates[0];
  return compact({
    retailer: best.retailer,
    purchaseDate: best.purchaseDate,
    price: best.price,
    currency: best.currency,
    invoiceNumber: best.invoiceNumber,
    sourceUploadId: best.sourceUploadId,
  });
}

function maintenanceFromUploads(uploads) {
  const items = [];
  for (const upload of uploads) {
    const rows = Array.isArray(upload.maintenance) ? upload.maintenance : [];
    for (const row of rows) {
      const task = clip(row.task, 120);
      const key = taskKey(task);
      if (!task || !key) continue;
      let intervalMonths = boundedInt(row.intervalMonths, 1, 240);
      let intervalDays = boundedInt(row.intervalDays, 1, 3650);
      if (intervalMonths && intervalDays) {
        if (intervalDays < 28) intervalMonths = undefined;
        else intervalDays = undefined;
      }
      let lastDone = calendarDate(row.lastDone);
      let explicitNext = calendarDate(row.nextDue);
      if (lastDone && explicitNext && explicitNext < lastDone) explicitNext = undefined;
      items.push({
        task,
        taskKey: key,
        intervalMonths,
        intervalDays,
        lastDone,
        explicitNext,
        sourceUploadId: upload._id,
        _fromManual: upload.kind === "manual",
      });
    }
  }
  return items;
}

function mergeMaintenance(items, { purchaseDate, serviceLog }) {
  const grouped = new Map();
  for (const item of items) {
    const current = grouped.get(item.taskKey);
    if (!current) {
      grouped.set(item.taskKey, { ...item });
      continue;
    }
    const manualIncoming = item._fromManual && !current._fromManual;
    if (manualIncoming) current.task = item.task;
    else if (!current._fromManual && !item._fromManual && item.task.length > current.task.length) {
      current.task = item.task;
    }
    if (item._fromManual) current._fromManual = true;
    const itemHasInterval = item.intervalMonths || item.intervalDays;
    const currentHasInterval = current.intervalMonths || current.intervalDays;
    if (itemHasInterval && (item._fromManual || !currentHasInterval)) {
      current.intervalMonths = item.intervalMonths;
      current.intervalDays = item.intervalDays;
      current.sourceUploadId = item.sourceUploadId;
    }
    if (item.lastDone && (!current.lastDone || item.lastDone > current.lastDone)) {
      current.lastDone = item.lastDone;
      if (!item._fromManual) current.sourceUploadId = item.sourceUploadId;
    }
    if (item.explicitNext && (!current.explicitNext || item.explicitNext > current.explicitNext)) {
      current.explicitNext = item.explicitNext;
    }
  }

  const doneByTask = new Map();
  for (const entry of serviceLog || []) {
    const key = entry.taskKey;
    const doneOn = calendarDate(entry.doneOn);
    if (!key || !doneOn) continue;
    const prev = doneByTask.get(key);
    if (!prev || doneOn > prev) doneByTask.set(key, doneOn);
  }

  const maintenance = [];
  for (const item of grouped.values()) {
    const logged = doneByTask.get(item.taskKey);
    let lastDone = item.lastDone;
    if (logged && (!lastDone || logged > lastDone)) lastDone = logged;
    const hasInterval = Boolean(item.intervalMonths || item.intervalDays);

    let nextDue;
    if (logged && hasInterval) {
      // The household said the work is done, so the old printed due date is finished.
      nextDue = shift(logged, item.intervalMonths, item.intervalDays);
    } else if (logged) {
      nextDue = undefined;
    } else if (item.explicitNext && (!lastDone || item.explicitNext > lastDone)) {
      nextDue = item.explicitNext;
    } else if (lastDone && hasInterval) {
      nextDue = shift(lastDone, item.intervalMonths, item.intervalDays);
    } else if (!lastDone && purchaseDate && hasInterval) {
      nextDue = shift(purchaseDate, item.intervalMonths, item.intervalDays);
    }

    maintenance.push(
      compact({
        task: item.task,
        taskKey: item.taskKey,
        intervalMonths: item.intervalMonths,
        intervalDays: item.intervalDays,
        lastDone,
        nextDue,
        sourceUploadId: item.sourceUploadId,
      })
    );
    if (maintenance.length === 12) break;
  }
  return maintenance;
}

function publicWarranty(fact) {
  return compact({
    provider: fact.provider,
    coverageType: fact.coverageType,
    termMonths: fact.termMonths,
    startDate: fact.startDate,
    endDate: fact.endDate,
    endDateCalculated: fact.endDateCalculated || undefined,
    coverage: fact.coverage,
    renewable: fact.renewable === true ? true : undefined,
    renewalDate: fact.renewalDate,
    sourceUploadId: fact.sourceUploadId,
  });
}

export function recordsFromUploads(uploads, serviceLog = []) {
  const list = Array.isArray(uploads) ? uploads : [];
  const purchase = choosePurchase(list);

  // Resolve end dates before deduping, so a "24 months from purchase" bill
  // collapses into a certificate that prints the same end date.
  const facts = list
    .map(warrantyFromUpload)
    .filter(Boolean)
    .map((fact) => resolveWarranty(fact, purchase?.purchaseDate));
  facts.sort((a, b) => b._kindRank - a._kindRank || b._confidence - a._confidence);
  const kept = [];
  for (const fact of facts) {
    const match = kept.find((item) => sameWarranty(item, fact));
    if (!match) kept.push({ ...fact });
    else Object.assign(match, preferWarranty(match, fact));
  }

  const warranties = kept.map(publicWarranty);
  const maintenance = mergeMaintenance(maintenanceFromUploads(list), {
    purchaseDate: purchase?.purchaseDate,
    serviceLog,
  });

  // Always return the arrays, including empty ones, so a removed document
  // clears the previous warranty or upkeep entry on save.
  return {
    ...(purchase ? { purchase } : {}),
    warranties,
    maintenance,
  };
}

export function recordsAreEmpty(records) {
  if (!records) return true;
  const purchase = records.purchase;
  const hasPurchase = Boolean(purchase?.purchaseDate || purchase?.retailer || purchase?.price);
  return !hasPurchase && !(records.warranties || []).length && !(records.maintenance || []).length;
}

function reminderStatus(today, remindOn, dueOn) {
  if (today > dueOn) return "overdue";
  if (today >= remindOn) return "due";
  return "scheduled";
}

function warrantyLabel(warranty) {
  const type = {
    manufacturer: "Manufacturer warranty",
    extended: "Extended warranty",
    retailer: "Retailer warranty",
    unknown: "Warranty",
  }[warranty.coverageType] || "Warranty";
  return [warranty.provider, type, warranty.coverage].filter(Boolean).join(" · ");
}

export function buildReminders(records, now = new Date()) {
  const today = todayIso(now);
  const reminders = [];
  const source = records || {};

  for (const warranty of source.warranties || []) {
    if (warranty.endDate) {
      const remindOn = addDays(warranty.endDate, -WARRANTY_LEAD_DAYS);
      const renewsOnExpiry = warranty.renewable === true && warranty.renewalDate === warranty.endDate;
      reminders.push({
        id: `warranty_expiration:${warranty.endDate}:${warranty.sourceUploadId || warranty.coverageType}`,
        type: "warranty_expiration",
        dueOn: warranty.endDate,
        remindOn,
        status: reminderStatus(today, remindOn, warranty.endDate),
        title: renewsOnExpiry ? "Warranty expires — renew" : "Warranty expires",
        detail: warrantyLabel(warranty),
        sourceUploadId: warranty.sourceUploadId,
      });
    }

    const separateRenewal =
      warranty.renewable === true &&
      warranty.renewalDate &&
      warranty.renewalDate !== warranty.endDate;
    if (separateRenewal) {
      const remindOn = addDays(warranty.renewalDate, -WARRANTY_LEAD_DAYS);
      reminders.push({
        id: `warranty_renewal:${warranty.renewalDate}:${warranty.sourceUploadId || warranty.coverageType}`,
        type: "warranty_renewal",
        dueOn: warranty.renewalDate,
        remindOn,
        status: reminderStatus(today, remindOn, warranty.renewalDate),
        title: "Renew warranty",
        detail: warrantyLabel(warranty),
        sourceUploadId: warranty.sourceUploadId,
      });
    }
  }

  for (const item of source.maintenance || []) {
    if (!item.nextDue) continue;
    const remindOn = addDays(item.nextDue, -MAINTENANCE_LEAD_DAYS);
    const interval = item.intervalDays
      ? `every ${item.intervalDays} days`
      : item.intervalMonths
        ? `every ${item.intervalMonths} months`
        : "";
    reminders.push({
      id: `maintenance:${item.nextDue}:${item.taskKey}`,
      type: "maintenance",
      dueOn: item.nextDue,
      remindOn,
      status: reminderStatus(today, remindOn, item.nextDue),
      title: item.task,
      detail: interval,
      taskKey: item.taskKey,
      sourceUploadId: item.sourceUploadId,
    });
  }

  reminders.sort(compareReminders);
  return reminders;
}

export function compareReminders(a, b) {
  const rank = { overdue: 0, due: 1, scheduled: 2 };
  const byStatus = (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
  if (byStatus) return byStatus;
  if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
  return String(a.title).localeCompare(String(b.title));
}

export function reminderInList(reminder, now = new Date()) {
  if (!reminder?.dueOn) return false;
  if (reminder.status === "overdue" || reminder.status === "due") return true;
  const today = todayIso(now);
  const horizon = addDays(today, REMINDER_LIST_DAYS);
  return Boolean(horizon && reminder.dueOn <= horizon);
}
