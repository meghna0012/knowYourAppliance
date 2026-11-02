import { useEffect, useState } from "react";
import api from "../api/axios.js";
import { uploadError } from "../lib/uploads.js";
import { coverageLabel, formatDate, intervalLabel, priceLabel, termLabel } from "../lib/records.js";

const KIND_LABEL = {
  sticker: "Model sticker",
  manual: "Manual",
  bill: "Bill",
  warranty: "Warranty",
  service: "Service",
  condition: "Condition",
  other: "Upload",
};

const SEVERITY_LABEL = {
  none: "No issue spotted",
  minor: "Minor",
  moderate: "Moderate",
  urgent: "Urgent",
};

function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function differs(next, current) {
  if (!next) return false;
  return next.trim().toLowerCase() !== (current || "").trim().toLowerCase();
}

function identityChanges(appliance, identification) {
  if (!identification) return [];
  const changes = [];
  const add = (label, next, current) => {
    if (differs(next, current)) changes.push({ label, next });
  };
  add("Brand", identification.brand, appliance.brand);
  add("Model", identification.modelNumber, appliance.modelNumber);
  add("Serial", identification.serialNumber, appliance.serialNumber);
  add("Generation", identification.generation, appliance.generation);
  if (identification.applianceType && !appliance.nickname) {
    changes.push({ label: "Nickname", next: identification.applianceType });
  }
  return changes;
}

function StoredFile({ applianceId, upload }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!upload.storedName || !upload.mimeType?.startsWith("image/")) return undefined;
    let objectUrl = "";
    let cancelled = false;
    api
      .get(`/appliances/${applianceId}/uploads/${upload._id}/file`, { responseType: "blob" })
      .then(({ data }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [applianceId, upload._id, upload.storedName, upload.mimeType]);

  const openFile = async () => {
    const { data } = await api.get(`/appliances/${applianceId}/uploads/${upload._id}/file`, {
      responseType: "blob",
    });
    const objectUrl = URL.createObjectURL(data);
    window.open(objectUrl, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  if (!upload.storedName) return null;
  if (url) {
    return <img src={url} alt="" className="mt-3 max-h-48 rounded object-contain bg-paper" />;
  }
  if (!upload.mimeType?.startsWith("image/")) {
    return (
      <button
        type="button"
        onClick={openFile}
        className="mt-3 font-mono text-[11px] uppercase tracking-wide text-steel hover:text-amber-dim"
      >
        Open file
      </button>
    );
  }
  return null;
}

function ReadingCard({ appliance, upload, busy, onApply, onRemove }) {
  const changes = identityChanges(appliance, upload.identification);
  const id = upload.identification || {};
  const bill = upload.bill || {};
  const warranty = upload.warranty || {};
  const condition = upload.condition || {};
  const manual = upload.manual || {};
  const maintenance = upload.maintenance || [];
  const billBits = [
    bill.retailer,
    bill.purchaseDate && formatDate(bill.purchaseDate),
    priceLabel(bill),
    bill.invoiceNumber && `Invoice ${bill.invoiceNumber}`,
    !warranty.termMonths && bill.warranty,
  ].filter(Boolean);
  const warrantyBits = [
    warranty.provider,
    warranty.coverageType && coverageLabel(warranty.coverageType),
    warranty.termMonths && termLabel(warranty.termMonths),
    warranty.startDate && `from ${formatDate(warranty.startDate)}`,
    warranty.endDate && `until ${formatDate(warranty.endDate)}`,
    warranty.renewable && warranty.renewalDate && `renew by ${formatDate(warranty.renewalDate)}`,
    warranty.coverage,
  ].filter(Boolean);
  const serial = id.serialNumber
    ? /^s\/?n(\b|\d)/i.test(id.serialNumber)
      ? id.serialNumber
      : `SN ${id.serialNumber}`
    : "";
  const idBits = [id.brand, id.modelNumber, serial, id.generation, id.applianceType].filter(Boolean);

  return (
    <article className="bg-white border border-ink/10 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-widest text-amber-dim">
          {KIND_LABEL[upload.kind] || "Upload"}
          {upload.confidence === "low" ? " · low confidence" : ""}
          {condition.severity ? ` · ${SEVERITY_LABEL[condition.severity] || condition.severity}` : ""}
        </p>
        <p className="font-mono text-[10px] text-steel shrink-0">{formatWhen(upload.createdAt)}</p>
      </div>
      {upload.originalName && (
        <p className="font-mono text-[10px] text-steel mt-1">{upload.originalName}</p>
      )}
      <p className="text-sm mt-2">{upload.summary}</p>

      {condition.safeToUse === false && (
        <p className="mt-3 text-sm bg-amber/15 border border-amber/40 rounded px-3 py-2">
          {condition.advice || "Stop using this appliance until someone qualified checks it."}
        </p>
      )}

      {idBits.length > 0 && (
        <p className="mt-3 font-mono text-xs text-steel">{idBits.join(" · ")}</p>
      )}
      {billBits.length > 0 && (
        <p className="mt-2 text-xs text-steel">{billBits.join(" · ")}</p>
      )}
      {warrantyBits.length > 0 && (
        <p className="mt-2 text-xs text-steel">{warrantyBits.join(" · ")}</p>
      )}
      {maintenance.length > 0 && (
        <ul className="mt-2 text-sm list-disc pl-4 space-y-1">
          {maintenance.map((item) => (
            <li key={`${item.task}-${item.nextDue || item.intervalMonths || item.intervalDays || ""}`}>
              {[
                item.task,
                intervalLabel(item),
                item.lastDone && `done ${formatDate(item.lastDone)}`,
                item.nextDue && `next ${formatDate(item.nextDue)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </li>
          ))}
        </ul>
      )}
      {condition.issues?.length > 0 && (
        <ul className="mt-2 text-sm list-disc pl-4 space-y-1">
          {condition.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {manual.keyPoints?.length > 0 && (
        <div className="mt-2">
          {manual.topic && <p className="text-xs font-medium">{manual.topic}</p>}
          <ul className="text-sm list-disc pl-4 space-y-1">
            {manual.keyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {upload.unreadable?.length > 0 && (
        <p className="mt-2 text-xs text-steel">Couldn't read: {upload.unreadable.join(", ")}</p>
      )}
      {upload.excerpt && upload.excerpt.length > 80 && (
        <details className="mt-2">
          <summary className="font-mono text-[11px] uppercase tracking-wide text-steel cursor-pointer">
            Text we read
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-steel font-mono">
            {upload.excerpt}
          </pre>
        </details>
      )}

      <StoredFile applianceId={appliance._id} upload={upload} />

      {changes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-steel mb-2">
            {changes.map((change) => `${change.label}: ${change.next}`).join(" · ")}
          </p>
          <button
            type="button"
            onClick={() => onApply(upload._id)}
            disabled={busy}
            className="bg-amber hover:bg-amber-dim transition-colors text-graphite font-display font-semibold rounded px-3 py-1.5 text-xs disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save this identification"}
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onRemove(upload._id)}
          disabled={busy}
          className="font-mono text-[11px] uppercase tracking-wide text-steel hover:text-amber disabled:opacity-50"
        >
          Remove
        </button>
        {upload.uploadedBy?.name && (
          <span className="font-mono text-[10px] uppercase tracking-wide text-steel">
            {upload.uploadedBy.name}
          </span>
        )}
      </div>
    </article>
  );
}

export default function ImageDiagnosis({ appliance, onChange }) {
  const [dragOver, setDragOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pendingUrl, setPendingUrl] = useState("");

  useEffect(() => {
    return () => {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
  }, [pendingUrl]);

  const uploads = [...(appliance.uploads || [])].reverse();
  const urgent = uploads.find((upload) => upload.condition?.severity === "urgent");

  const diagnose = async (file, extraCount) => {
    const problem = uploadError(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setNote(extraCount > 0 ? "Reading the first file. Add the others one at a time." : "");
    setReading(true);
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : "");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post(`/appliances/${appliance._id}/diagnose`, form);
      onChange(data.appliance);
      setPendingUrl("");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't read that upload");
    } finally {
      setReading(false);
    }
  };

  const takeFiles = (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length || reading) return;
    diagnose(files[0], files.length - 1);
  };

  const apply = async (uploadId) => {
    setBusyId(uploadId);
    setError("");
    try {
      const { data } = await api.post(`/appliances/${appliance._id}/uploads/${uploadId}/apply`);
      onChange(data.appliance);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save that identification");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (uploadId) => {
    setBusyId(uploadId);
    setError("");
    try {
      const { data } = await api.delete(`/appliances/${appliance._id}/uploads/${uploadId}`);
      onChange(data.appliance);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't remove that reading");
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="mb-8">
      <p className="font-mono text-xs uppercase tracking-widest text-steel mb-3">Image diagnosis</p>

      {urgent && (
        <div className="mb-3 border border-amber bg-amber/15 rounded px-4 py-3 text-sm">
          <p className="font-display font-semibold">
            {urgent.condition?.safeToUse === false
              ? "Stop using this appliance"
              : "This appliance needs attention"}
          </p>
          <p className="mt-1">{urgent.condition?.advice || urgent.summary}</p>
        </div>
      )}

      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (!reading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          takeFiles(event.dataTransfer.files);
        }}
        className={`block border border-dashed rounded-lg px-4 py-6 text-center cursor-pointer ${
          dragOver ? "border-amber bg-amber/10" : "border-ink/20 bg-white"
        } ${reading ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          type="file"
          accept="image/*,.pdf,.heic,.heif,application/pdf"
          className="sr-only"
          disabled={reading}
          onChange={(event) => {
            takeFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <p className="font-display font-semibold text-sm">
          {reading ? "Reading…" : "Drop a photo or PDF, or click to choose one"}
        </p>
        <p className="text-xs text-steel mt-1">
          Model stickers, manuals, bills, warranty cards, and photos of the appliance all work.
        </p>
      </label>

      {pendingUrl && (
        <img src={pendingUrl} alt="" className="mt-3 max-h-40 rounded object-contain" />
      )}
      {note && <p className="mt-2 text-xs text-steel">{note}</p>}
      {error && (
        <p role="status" className="mt-2 text-sm text-amber-dim">
          {error}
        </p>
      )}

      {uploads.length > 0 && (
        <div className="mt-4 space-y-3">
          {uploads.map((upload) => (
            <ReadingCard
              key={upload._id}
              appliance={appliance}
              upload={upload}
              busy={busyId === upload._id}
              onApply={apply}
              onRemove={remove}
            />
          ))}
        </div>
      )}
    </section>
  );
}
