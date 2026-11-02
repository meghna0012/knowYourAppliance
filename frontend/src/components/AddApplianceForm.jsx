import { useRef, useState } from "react";
import api from "../api/axios.js";
import { uploadError } from "../lib/uploads.js";
import { coverageLabel, formatDate, priceLabel, termLabel } from "../lib/records.js";

export default function AddApplianceForm({ onAdd }) {
  const fileRef = useRef(null);
  const [brand, setBrand] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [generation, setGeneration] = useState("");
  const [file, setFile] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [records, setRecords] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRead = async (chosen) => {
    const problem = uploadError(chosen);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setNote("");
    setReading(true);
    try {
      const form = new FormData();
      form.append("file", chosen);
      const { data } = await api.post("/appliances/identify", form);
      const readingResult = data.diagnosis || {};
      const id = readingResult.identification || {};
      if (id.brand) setBrand(id.brand);
      if (id.modelNumber) setModelNumber(id.modelNumber);
      if (id.serialNumber) setSerialNumber(id.serialNumber);
      if (id.generation) setGeneration(id.generation);
      if (id.applianceType) {
        setNickname((current) => current || id.applianceType);
      }
      setFile(chosen);
      setDiagnosis(readingResult);
      setRecords(data.records || null);
      const confidence = readingResult.confidence === "low" ? " Low confidence — check the fields before saving." : "";
      setNote(`${readingResult.summary || "Reading saved with the appliance."}${confidence}`);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't read that file");
    } finally {
      setReading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!brand || !modelNumber) return;
    setLoading(true);
    setError("");
    try {
      await onAdd({ brand, modelNumber, nickname, serialNumber, generation, diagnosis, file });
      setBrand("");
      setModelNumber("");
      setNickname("");
      setSerialNumber("");
      setGeneration("");
      setFile(null);
      setDiagnosis(null);
      setRecords(null);
      setNote("");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't add that appliance");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-graphite plate-texture rounded-lg p-5 shadow-lg mb-8"
    >
      <p className="font-mono text-xs uppercase tracking-widest text-steel mb-3">
        Register a new appliance
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Brand (e.g. Samsung)"
          required
          className="bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm"
        />
        <input
          value={modelNumber}
          onChange={(e) => setModelNumber(e.target.value)}
          placeholder="Model number"
          required
          className="bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm font-mono"
        />
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Nickname (optional)"
          className="bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm"
        />
      </div>

      {(serialNumber || generation || diagnosis) && (
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Serial number"
            className="bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm font-mono"
          />
          <input
            value={generation}
            onChange={(e) => setGeneration(e.target.value)}
            placeholder="Generation"
            className="bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm font-mono"
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={loading || reading}
          className="bg-amber hover:bg-amber-dim transition-colors text-graphite font-display font-semibold rounded px-4 py-2 text-sm disabled:opacity-60"
        >
          {loading ? "Adding…" : "Add appliance"}
        </button>
        <button
          type="button"
          disabled={reading || loading}
          onClick={() => fileRef.current?.click()}
          className="font-mono text-xs uppercase tracking-wide text-steel-light hover:text-amber disabled:opacity-50"
        >
          {reading ? "Reading…" : "Read a photo or PDF"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.heic,.heif,application/pdf"
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (chosen) handleRead(chosen);
          }}
        />
      </div>
      <p className="mt-2 text-xs text-steel">
        A model sticker fills the brand and model. Bills and warranty cards save the purchase and expiry. Manuals save the upkeep schedule.
      </p>
      {records?.purchase?.purchaseDate && (
        <p className="mt-2 text-xs text-steel-light">
          Purchase {formatDate(records.purchase.purchaseDate)}
          {records.purchase.retailer ? ` · ${records.purchase.retailer}` : ""}
          {priceLabel(records.purchase) ? ` · ${priceLabel(records.purchase)}` : ""}
        </p>
      )}
      {(records?.warranties || []).map((warranty, index) => (
        <p key={`${warranty.coverageType}-${index}`} className="mt-1 text-xs text-steel-light">
          {coverageLabel(warranty.coverageType)}
          {warranty.endDate ? ` until ${formatDate(warranty.endDate)}` : ""}
          {!warranty.endDate && warranty.termMonths ? ` · ${termLabel(warranty.termMonths)}` : ""}
          {warranty.endDateCalculated ? " · from the term on the document" : ""}
        </p>
      ))}
      {(records?.maintenance || []).slice(0, 3).map((item) => (
        <p key={item.taskKey || item.task} className="mt-1 text-xs text-steel-light">
          {item.task}
          {item.nextDue ? ` · due ${formatDate(item.nextDue)}` : ""}
        </p>
      ))}
      {note && <p className="mt-2 text-xs text-steel-light">{note}</p>}
      {error && <p className="mt-2 text-sm text-amber">{error}</p>}
    </form>
  );
}
