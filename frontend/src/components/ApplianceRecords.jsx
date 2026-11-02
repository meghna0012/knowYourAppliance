import { useState } from "react";
import api from "../api/axios.js";
import {
  coverageLabel,
  formatDate,
  intervalLabel,
  localIso,
  priceLabel,
  statusLabel,
  termLabel,
} from "../lib/records.js";

function sourceName(appliance, id) {
  if (!id) return "";
  const upload = (appliance.uploads || []).find((item) => item._id === id);
  return upload?.originalName || "";
}

export default function ApplianceRecords({ appliance, onChange }) {
  const records = appliance.records || {};
  const purchase = records.purchase;
  const warranties = records.warranties || [];
  const maintenance = records.maintenance || [];
  const reminders = (appliance.reminders || []).filter(
    (item) => item.status === "overdue" || item.status === "due"
  );
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");

  if (!purchase && warranties.length === 0 && maintenance.length === 0) return null;

  const markDone = async (taskKey) => {
    setBusyKey(taskKey);
    setError("");
    try {
      const { data } = await api.post(`/appliances/${appliance._id}/maintenance/done`, {
        taskKey,
        doneOn: localIso(),
      });
      onChange(data.appliance);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't record that");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <section className="mb-8">
      <p className="font-mono text-xs uppercase tracking-widest text-steel mb-3">Warranty and upkeep</p>

      {reminders.map((reminder) => (
        <div
          key={reminder.id}
          className="mb-3 border border-amber bg-amber/15 rounded px-4 py-3 text-sm"
        >
          <p className="font-display font-semibold">
            {statusLabel(reminder.status)} · {reminder.title}
          </p>
          <p className="mt-1">
            {formatDate(reminder.dueOn)}
            {reminder.detail ? ` · ${reminder.detail}` : ""}
          </p>
        </div>
      ))}

      <div className="bg-white border border-ink/10 rounded-lg p-4 space-y-4">
        {purchase && (purchase.purchaseDate || purchase.retailer || purchase.price) && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-amber-dim">Purchase</p>
            <p className="text-sm mt-1">
              {[
                purchase.purchaseDate && formatDate(purchase.purchaseDate),
                purchase.retailer,
                priceLabel(purchase),
                purchase.invoiceNumber && `Invoice ${purchase.invoiceNumber}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {sourceName(appliance, purchase.sourceUploadId) && (
              <p className="font-mono text-[10px] text-steel mt-1">
                {sourceName(appliance, purchase.sourceUploadId)}
              </p>
            )}
          </div>
        )}

        {warranties.map((warranty) => (
          <div key={`${warranty.coverageType}-${warranty.endDate || warranty.termMonths}-${warranty.provider || ""}`}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-amber-dim">
              {coverageLabel(warranty.coverageType)}
            </p>
            <p className="text-sm mt-1">
              {[
                warranty.provider,
                warranty.endDate && `Ends ${formatDate(warranty.endDate)}`,
                !warranty.endDate && warranty.termMonths && termLabel(warranty.termMonths),
                warranty.renewable &&
                  warranty.renewalDate &&
                  warranty.renewalDate !== warranty.endDate &&
                  `Renew by ${formatDate(warranty.renewalDate)}`,
                warranty.renewable && warranty.renewalDate === warranty.endDate && "Renew before it ends",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {warranty.endDateCalculated && warranty.startDate && warranty.termMonths && (
              <p className="text-xs text-steel mt-1">
                {termLabel(warranty.termMonths)} starting {formatDate(warranty.startDate)}
              </p>
            )}
            {!warranty.endDate && warranty.termMonths && (
              <p className="text-xs text-steel mt-1">No start date on the document, so there is no expiry reminder yet.</p>
            )}
            {warranty.coverage && <p className="text-xs text-steel mt-1">{warranty.coverage}</p>}
            {sourceName(appliance, warranty.sourceUploadId) && (
              <p className="font-mono text-[10px] text-steel mt-1">
                {sourceName(appliance, warranty.sourceUploadId)}
              </p>
            )}
          </div>
        ))}

        {maintenance.length > 0 && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-amber-dim">Upkeep</p>
            <ul className="mt-2 space-y-3">
              {maintenance.map((item) => (
                <li key={item.taskKey} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm">{item.task}</p>
                    <p className="text-xs text-steel mt-0.5">
                      {[
                        intervalLabel(item),
                        item.lastDone && `last done ${formatDate(item.lastDone)}`,
                        item.nextDue && `next ${formatDate(item.nextDue)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {item.nextDue && (
                    <button
                      type="button"
                      onClick={() => markDone(item.taskKey)}
                      disabled={busyKey === item.taskKey}
                      className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-steel hover:text-amber-dim disabled:opacity-50"
                    >
                      {busyKey === item.taskKey ? "Saving…" : "Done"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && (
        <p role="status" className="mt-2 text-sm text-amber-dim">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-steel">
        Taken from your bills, warranty cards, and manuals. Removing a reading drops its dates.
        Warranty reminders start 30 days out. Upkeep reminders start 7 days out.
      </p>
    </section>
  );
}
