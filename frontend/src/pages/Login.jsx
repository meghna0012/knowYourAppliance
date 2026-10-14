import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
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
              Unit Access
            </span>
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            Know Your Appliance
          </h1>
          <p className="text-steel text-sm mt-1">Sign in to your account</p>
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-6 bg-graphite-light text-paper rounded px-3 py-2 outline-none focus:ring-2 focus:ring-amber text-sm"
            placeholder="••••••••"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber hover:bg-amber-dim transition-colors text-graphite font-display font-semibold rounded py-2 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-steel mt-4">
          No account yet?{" "}
          <Link to="/register" className="text-amber-dim font-medium">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
