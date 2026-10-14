import { useNavigate } from "react-router-dom";

export default function ApplianceCard({ appliance, onDelete }) {
  const navigate = useNavigate();

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

      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-steel">
        <span>{appliance.history?.length || 0} questions asked</span>
        <span className="font-mono">→</span>
      </div>
    </div>
  );
}
