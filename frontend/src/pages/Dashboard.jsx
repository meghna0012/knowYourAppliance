import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";
import ApplianceCard from "../components/ApplianceCard.jsx";
import AddApplianceForm from "../components/AddApplianceForm.jsx";
import { formatDate, localIso, statusLabel } from "../lib/records.js";

export default function Dashboard() {
  const [appliances, setAppliances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [household, setHousehold] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [reminderBusy, setReminderBusy] = useState("");
  const [reminderError, setReminderError] = useState("");
  const { user, logout } = useAuth();

  const query = search.trim();

  useEffect(() => {
    api.get("/household").then(({ data }) => setHousehold(data)).catch(() => {});
  }, []);

  const loadReminders = () => {
    api
      .get("/appliances/reminders")
      .then(({ data }) => setReminders(data.reminders || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadReminders();
  }, []);

  // Debounced so we don't hit the API on every keystroke; `ignore` drops
  // responses that arrive after a newer search has started.
  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/appliances", {
          params: query ? { q: query } : undefined,
        });
        if (!ignore) setAppliances(data);
      } finally {
        if (!ignore) setLoading(false);
      }
    }, query ? 250 : 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handleAdd = async ({ file, diagnosis, ...fields }) => {
    const payload = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value) payload[key] = value;
    }

    let data;
    if (file) {
      const form = new FormData();
      for (const [key, value] of Object.entries(payload)) form.append(key, value);
      if (diagnosis) form.append("diagnosis", JSON.stringify(diagnosis));
      form.append("file", file);
      ({ data } = await api.post("/appliances", form));
    } else {
      ({ data } = await api.post("/appliances", diagnosis ? { ...payload, diagnosis } : payload));
    }

    setSearch("");
    setAppliances((prev) => [data, ...prev]);
    loadReminders();
  };

  const handleDelete = async (id) => {
    await api.delete(`/appliances/${id}`);
    setAppliances((prev) => prev.filter((a) => a._id !== id));
    loadReminders();
  };

  const markDone = async (item) => {
    setReminderBusy(item.id);
    setReminderError("");
    try {
      const { data } = await api.post(`/appliances/${item.applianceId}/maintenance/done`, {
        taskKey: item.taskKey,
        doneOn: localIso(),
      });
      setAppliances((prev) => prev.map((appliance) => (
        appliance._id === data.appliance._id ? data.appliance : appliance
      )));
      loadReminders();
    } catch (err) {
      setReminderError(err.response?.data?.message || "Couldn't record that");
    } finally {
      setReminderBusy("");
    }
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
          <Link
            to="/household"
            className="font-mono text-xs uppercase tracking-wide text-steel hover:text-amber-dim"
          >
            Household
          </Link>
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

        {reminders.length > 0 && (
          <section className="mb-8">
            <p className="font-mono text-xs uppercase tracking-widest text-steel mb-3">Reminders</p>
            <div className="space-y-2">
              {reminders.map((item) => (
                <div
                  key={`${item.applianceId}-${item.id}`}
                  className="bg-white border border-ink/10 rounded-lg px-4 py-3 flex items-start justify-between gap-3"
                >
                  <Link to={`/appliances/${item.applianceId}`} className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-widest text-amber-dim">
                      {statusLabel(item.status)} · {formatDate(item.dueOn)}
                    </p>
                    <p className="text-sm font-medium mt-1">{item.title}</p>
                    <p className="text-xs text-steel mt-0.5 truncate">
                      {[item.nickname || item.brand, item.detail].filter(Boolean).join(" · ")}
                    </p>
                  </Link>
                  {item.type === "maintenance" && (
                    <button
                      type="button"
                      onClick={() => markDone(item)}
                      disabled={reminderBusy === item.id}
                      className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-steel hover:text-amber-dim disabled:opacity-50"
                    >
                      {reminderBusy === item.id ? "Saving…" : "Done"}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {reminderError && (
              <p role="status" className="mt-2 text-sm text-amber-dim">
                {reminderError}
              </p>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-steel">
              {household ? `${household.name} · appliances` : "Household appliances"}
            </p>
            {household && household.members.length > 1 && (
              <p className="text-xs text-steel mt-1">
                Shared with {household.members.length - 1} other member
                {household.members.length > 2 ? "s" : ""}
              </p>
            )}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand, model or nickname"
            className="w-full sm:w-72 bg-white border border-ink/10 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm"
          />
        </div>

        {loading ? (
          <p className="text-steel text-sm">Loading…</p>
        ) : appliances.length === 0 ? (
          <p className="text-steel text-sm">
            {query
              ? `No appliances match "${query}".`
              : "No appliances yet. Add one above to start asking questions."}
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
