import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/axios.js";

export default function ApplianceDetail() {
  const { id } = useParams();
  const [appliance, setAppliance] = useState(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const bottomRef = useRef(null);

  const fetchAppliance = async () => {
    const { data } = await api.get(`/appliances/${id}`);
    setAppliance(data);
  };

  useEffect(() => {
    fetchAppliance();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [appliance?.history?.length]);

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    const q = question;
    setQuestion("");
    try {
      const { data } = await api.post(`/appliances/${id}/ask`, { question: q });
      setAppliance((prev) => ({ ...prev, history: data.history }));
    } catch (err) {
      alert(err.response?.data?.message || "Something went wrong asking the AI");
    } finally {
      setAsking(false);
    }
  };

  if (!appliance) {
    return (
      <div className="min-h-screen flex items-center justify-center text-steel text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-ink/10 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-mono text-xs uppercase tracking-wide text-steel hover:text-amber-dim">
          ← Back
        </Link>
        <div className="text-right">
          <p className="font-display font-semibold">{appliance.brand}</p>
          <p className="font-mono text-xs text-steel">{appliance.modelNumber}</p>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 flex flex-col">
        <div className="flex-1 space-y-4 mb-4">
          {appliance.history.length === 0 && (
            <p className="text-steel text-sm text-center mt-10">
              Ask anything about your {appliance.brand} {appliance.modelNumber} — error
              codes, maintenance, part numbers, settings, and more.
            </p>
          )}

          {appliance.history.map((qa) => (
            <div key={qa._id} className="space-y-2">
              <div className="flex justify-end">
                <div className="bg-amber text-graphite rounded-lg rounded-br-none px-4 py-2 max-w-[80%] text-sm font-medium">
                  {qa.question}
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-graphite plate-texture text-paper rounded-lg rounded-bl-none px-4 py-2 max-w-[80%] text-sm whitespace-pre-wrap">
                  {qa.answer}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleAsk} className="flex gap-2 sticky bottom-6">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What does error code E4 mean?"
            className="flex-1 bg-graphite-light text-paper rounded px-4 py-3 outline-none focus:ring-2 focus:ring-amber text-sm shadow-lg"
          />
          <button
            type="submit"
            disabled={asking}
            className="bg-amber hover:bg-amber-dim transition-colors text-graphite font-display font-semibold rounded px-5 disabled:opacity-60"
          >
            {asking ? "…" : "Ask"}
          </button>
        </form>
      </main>
    </div>
  );
}
