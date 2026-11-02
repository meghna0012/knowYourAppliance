import { useNavigate } from "react-router-dom";
import { careLine } from "../lib/records.js";

export default function ApplianceCard({ appliance, onDelete }) {
  const navigate = useNavigate();
  const care = careLine(appliance);

  return (
    <div
      onClick={() => navigate(`/appliances/${appliance._id}`)}
      className="group cursor-pointer bg-graphite plate-texture rounded-lg p-5 shadow-lg hover:shadow-2xl hover:-translate-y-0.5 transition-all relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="w-2 h-2 rounded-full bg-amber indicator-dot mt-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(appliance._id);
          }}
          className="text-steel hover:text-amber text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity"
        >
          remove
        </button>
      </div>

      {appliance.nickname && (
        <p className="text-amber-dim text-xs font-mono uppercase tracking-wide mb-1">
          {appliance.nickname}
        </p>
      )}
      <h3 className="font-display text-xl font-semibold text-paper mb-1">
        {appliance.brand}
      </h3>
      <p className="font-mono text-steel-light text-sm">{appliance.modelNumber}</p>
      {appliance.serialNumber && (
        <p className="font-mono text-xs text-steel mt-1">
          {/^s\/?n(\b|\d)/i.test(appliance.serialNumber) ? appliance.serialNumber : `SN ${appliance.serialNumber}`}
        </p>
      )}
      {appliance.uploads?.some((upload) => upload.condition?.severity === "urgent") && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-amber">Needs attention</p>
      )}
      {care && (
        <p className={`mt-3 text-xs ${care.alert ? "text-amber" : "text-steel-light"}`}>{care.text}</p>
      )}

      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-steel">
        <span>
          {appliance.history?.length || 0} questions asked
          {appliance.user?.name && <> · added by {appliance.user.name}</>}
        </span>
        <span className="font-mono">→</span>
      </div>
    </div>
  );
}
