import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

function LoginScreen() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    api
      .getMe()
      .then(() => {
        if (mounted) setLoggedIn(true);
      })
      .catch(() => {
        if (mounted) setLoggedIn(false);
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (checking) return <p className="text-center mt-16 text-slate-600">Checking Salesforce session...</p>;
  if (loggedIn) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-lg p-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Salesforce Validation Rule Manager</h1>
        <p className="text-slate-600 mb-8">Log in to Salesforce to manage Account object validation rules.</p>
        <a
          href={`${api.baseUrl}/auth/salesforce`}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-6 py-3 text-white font-semibold hover:bg-brand-700 transition"
        >
          Login with Salesforce
        </a>
      </div>
    </div>
  );
}

function Dashboard() {
  const [user, setUser] = useState(null);
  const [rules, setRules] = useState([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingRules, setLoadingRules] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api
      .getMe()
      .then((data) => setUser(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingUser(false));
  }, []);

  const hasPending = useMemo(() => rules.some((rule) => rule.pending), [rules]);

  async function fetchRules() {
    setLoadingRules(true);
    setError("");
    setMessage("");
    try {
      const data = await api.getValidationRules();
      setRules(data.records.map((rule) => ({ ...rule, pending: false })));
      setMessage(`Fetched ${data.records.length} Account validation rules.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRules(false);
    }
  }

  async function stageRule(rule, active) {
    try {
      await api.stageToggle({ ...rule, active });
      setRules((prev) => prev.map((item) => (item.id === rule.id ? { ...item, active, pending: true } : item)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function setAllRules(active) {
    for (const rule of rules) {
      if (rule.active !== active) {
        await stageRule(rule, active);
      }
    }
  }

  async function deployChanges() {
    setDeploying(true);
    setError("");
    setMessage("");
    try {
      const data = await api.deploy();
      setRules((prev) => prev.map((rule) => ({ ...rule, pending: false })));
      setMessage(data.message || "Deployment completed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeploying(false);
    }
  }

  async function logout() {
    await api.logout();
    window.location.href = "/";
  }

  if (loadingUser) return <p className="text-center mt-16 text-slate-600">Loading user details...</p>;
  if (!user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="bg-white rounded-2xl shadow p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Connected User</h2>
            <p className="text-slate-600">
              {user.displayName} ({user.username})
            </p>
            <p className="text-xs text-slate-500">Org: {user.organizationId}</p>
          </div>
          <button onClick={logout} className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50">
            Logout
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchRules}
              disabled={loadingRules}
              className="rounded-lg bg-brand-500 px-4 py-2 text-white font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {loadingRules ? "Fetching..." : "Fetch Validation Rules"}
            </button>
            <button onClick={() => setAllRules(true)} disabled={!rules.length} className="rounded-lg bg-emerald-600 px-4 py-2 text-white font-medium disabled:opacity-50">
              Enable All
            </button>
            <button onClick={() => setAllRules(false)} disabled={!rules.length} className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium disabled:opacity-50">
              Disable All
            </button>
            <button onClick={deployChanges} disabled={!hasPending || deploying} className="rounded-lg bg-slate-800 px-4 py-2 text-white font-medium disabled:opacity-50">
              {deploying ? "Deploying..." : "Deploy Changes"}
            </button>
          </div>
          {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        </div>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left p-3">Rule Name</th>
                <th className="text-left p-3">Error Condition Formula</th>
                <th className="text-left p-3">Error Message</th>
                <th className="text-left p-3">Active Status</th>
                <th className="text-left p-3">Toggle</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={5}>
                    No rules loaded yet.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-slate-100">
                    <td className="p-3 font-medium text-slate-900">{rule.validationName}</td>
                    <td className="p-3 text-slate-600 font-mono text-xs">{rule.errorConditionFormula || "-"}</td>
                    <td className="p-3 text-slate-600">{rule.errorMessage || "-"}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          rule.active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {rule.active ? "Active" : "Inactive"}
                      </span>
                      {rule.pending ? <span className="ml-2 text-xs text-amber-600">Pending</span> : null}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => stageRule(rule, !rule.active)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                      >
                        Set {rule.active ? "Inactive" : "Active"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
