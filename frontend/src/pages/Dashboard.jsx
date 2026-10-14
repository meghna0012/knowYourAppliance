import { useEffect, useState } from "react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";
import ApplianceCard from "../components/ApplianceCard.jsx";
import AddApplianceForm from "../components/AddApplianceForm.jsx";

export default function Dashboard() {
  const [appliances, setAppliances] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();

  const fetchAppliances = async () => {
    setLoading(true);
    const { data } = await api.get("/appliances");
    setAppliances(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAppliances();
  }, []);

  const handleAdd = async (payload) => {
    const { data } = await api.post("/appliances", payload);
    setAppliances((prev) => [data, ...prev]);
  };

  const handleDelete = async (id) => {
    await api.delete(`/appliances/${id}`);
    setAppliances((prev) => prev.filter((a) => a._id !== id));
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber indicator-dot" />
          <h1 className="font-display text-lg font-semibold">Know Your Appliance</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-steel">Hi, {user?.name}</span>
          <button
            onClick={logout}
            className="font-mono text-xs uppercase tracking-wide text-steel hover:text-amber-dim"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <AddApplianceForm onAdd={handleAdd} />

        <p className="font-mono text-xs uppercase tracking-widest text-steel mb-3">
          Your appliances
        </p>

        {loading ? (
          <p className="text-steel text-sm">Loading…</p>
        ) : appliances.length === 0 ? (
          <p className="text-steel text-sm">
            No appliances yet. Add one above to start asking questions.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {appliances.map((a) => (
              <ApplianceCard key={a._id} appliance={a} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
