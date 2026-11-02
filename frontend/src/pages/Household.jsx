import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

const sectionLabel = "font-mono text-xs uppercase tracking-widest text-steel mb-3";
const card = "bg-graphite plate-texture rounded-lg p-5 shadow-lg mb-6";
const input =
  "bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm";
const primaryButton =
  "bg-amber hover:bg-amber-dim transition-colors text-graphite font-display font-semibold rounded px-4 py-2 text-sm disabled:opacity-60";
const textButton =
  "font-mono text-xs uppercase tracking-wide text-steel-light hover:text-amber disabled:opacity-50";

export default function Household() {
  const { user } = useAuth();
  const [household, setHousehold] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  const applyHousehold = (data) => {
    setHousehold(data);
    setName(data.name);
  };

  useEffect(() => {
    api
      .get("/household")
      .then(({ data }) => applyHousehold(data))
      .catch((err) => setError(err.response?.data?.message || "Could not load household"));
  }, []);

  // Wraps every mutation: one in-flight action at a time, uniform error/notice.
  const run = async (request, successMessage) => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { data } = await request();
      applyHousehold(data);
      if (successMessage) setNotice(successMessage);
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't access the clipboard. Copy it manually.");
    }
  };

  const handleRename = (e) => {
    e.preventDefault();
    run(() => api.patch("/household", { name: name.trim() }), "Household renamed");
  };

  const handleRegenerate = () => {
    if (!confirm("Change the invite code? The current code will stop working.")) return;
    run(() => api.post("/household/invite-code"), "Invite code changed");
  };

  const handleTransfer = (member) => {
    if (!confirm(`Make ${member.name} the admin? You'll become a regular member.`)) return;
    run(
      () => api.post("/household/transfer-admin", { userId: member._id }),
      `${member.name} is now the admin`
    );
  };

  const handleRemove = (member) => {
    if (!confirm(`Remove ${member.name} from the household? Appliances they added will stay here.`))
      return;
    run(() => api.delete(`/household/members/${member._id}`), `${member.name} was removed`);
  };

  const handleLeave = () => {
    if (!confirm("Leave this household? You'll lose access to its appliances.")) return;
    run(() => api.post("/household/leave"), "You left the household. This is your new personal household.");
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const soleMember = household?.members.length === 1;
    const warning = soleMember
      ? "Join this household? Your appliances will move with you."
      : "Join this household? You'll lose access to your current household's appliances.";
    if (!confirm(warning)) return;
    const ok = await run(
      () => api.post("/household/join", { inviteCode: joinCode.trim() }),
      "Welcome to your new household!"
    );
    if (ok) setJoinCode("");
  };

  if (!household) {
    return (
      <div className="min-h-screen flex items-center justify-center text-steel text-sm">
        {error || "Loading…"}
      </div>
    );
  }

  const isSoleMember = household.members.length === 1;

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-mono text-xs uppercase tracking-wide text-steel hover:text-amber-dim">
          ← Back
        </Link>
        <p className="font-display font-semibold">{household.name}</p>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 text-sm text-amber-dim bg-amber/10 border border-amber/30 rounded px-3 py-2">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-6 text-sm text-ink bg-ink/5 border border-ink/10 rounded px-3 py-2">
            {notice}
          </div>
        )}

        {household.isAdmin && (
          <form onSubmit={handleRename} className={card}>
            <p className={sectionLabel}>Household name</p>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                className={`${input} flex-1`}
              />
              <button
                type="submit"
                disabled={busy || !name.trim() || name.trim() === household.name}
                className={primaryButton}
              >
                Save
              </button>
            </div>
          </form>
        )}

        <section className={card}>
          <p className={sectionLabel}>Invite code</p>
          <p className="font-mono text-3xl tracking-[0.3em] text-amber mb-2">
            {household.inviteCode}
          </p>
          <p className="text-xs text-steel-light mb-4">
            Share this code with family. They sign up normally, then enter it under
            "Join another household" on this page.
          </p>
          <div className="flex flex-wrap gap-4">
            <button onClick={copyCode} className={textButton}>
              {copied ? "Copied!" : "Copy code"}
            </button>
            {household.isAdmin && (
              <button onClick={handleRegenerate} disabled={busy} className={textButton}>
                Change code
              </button>
            )}
          </div>
        </section>

        <section className={card}>
          <p className={sectionLabel}>
            Members ({household.members.length}/{household.maxMembers})
          </p>
          <ul className="divide-y divide-white/10">
            {household.members.map((m) => (
              <li key={m._id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-paper text-sm font-medium truncate">
                    {m.name}
                    {m._id === user?._id && <span className="text-steel"> (you)</span>}
                    {m.isAdmin && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wide bg-amber/20 text-amber rounded px-1.5 py-0.5">
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="text-steel text-xs truncate">{m.email}</p>
                </div>
                {household.isAdmin && !m.isAdmin && (
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => handleTransfer(m)} disabled={busy} className={textButton}>
                      Make admin
                    </button>
                    <button onClick={() => handleRemove(m)} disabled={busy} className={textButton}>
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <form onSubmit={handleJoin} className={card}>
          <p className={sectionLabel}>Join another household</p>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Invite code"
              maxLength={16}
              required
              className={`${input} flex-1 font-mono tracking-widest`}
            />
            <button type="submit" disabled={busy || !joinCode.trim()} className={primaryButton}>
              Join
            </button>
          </div>
        </form>

        {!isSoleMember && (
          <div className="text-center">
            {household.isAdmin ? (
              <p className="text-xs text-steel">
                To leave, first make another member the admin.
              </p>
            ) : (
              <button onClick={handleLeave} disabled={busy} className={textButton}>
                Leave household
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
