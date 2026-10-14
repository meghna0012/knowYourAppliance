import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(name, email, password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber indicator-dot" />
            <span className="font-mono text-xs tracking-widest text-steel uppercase">
              New Registration
            </span>
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            Create your account
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-graphite plate-texture rounded-lg p-6 shadow-xl"
        >
          {error && (
            <div className="mb-4 text-sm text-amber bg-amber/10 border border-amber/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <label className="block text-xs font-mono uppercase tracking-wide text-steel-light mb-1">
            Name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mb-4 bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm"
            placeholder="Jane Doe"
          />

          <label className="block text-xs font-mono uppercase tracking-wide text-steel-light mb-1">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm"
            placeholder="you@example.com"
          />

          <label className="block text-xs font-mono uppercase tracking-wide text-steel-light mb-1">
            Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-6 bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm"
            placeholder="At least 6 characters"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber hover:bg-amber-dim transition-colors text-graphite font-display font-semibold rounded py-2 disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-steel mt-4">
          Already registered?{" "}
          <Link to="/login" className="text-amber-dim font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
