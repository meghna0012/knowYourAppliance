import { useState } from "react";

export default function AddApplianceForm({ onAdd }) {
  const [brand, setBrand] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!brand || !modelNumber) return;
    setLoading(true);
    try {
      await onAdd({ brand, modelNumber, nickname });
      setBrand("");
      setModelNumber("");
      setNickname("");
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
      <button
        type="submit"
        disabled={loading}
        className="mt-4 bg-amber hover:bg-amber-dim transition-colors text-graphite font-display font-semibold rounded px-4 py-2 text-sm disabled:opacity-60"
      >
        {loading ? "Adding…" : "Add appliance"}
      </button>
    </form>
  );
}
