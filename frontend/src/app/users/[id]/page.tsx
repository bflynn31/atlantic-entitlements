"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, User, Entitlements, Subscription } from "@/lib/api";

// ─── Entitlements display ─────────────────────────────────────────────────────

function EntitlementBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border p-4 gap-1 ${
        active
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : "bg-gray-50 border-gray-200 text-gray-400"
      }`}
    >
      <span className="text-2xl">{active ? "✓" : "✗"}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

// ─── Subscription status helpers ─────────────────────────────────────────────

function subStatus(sub: Subscription): "active" | "expired" | "revoked" | "pending" {
  if (sub.revoked_at) return "revoked";
  const today = new Date().toISOString().slice(0, 10);
  if (sub.start_date > today) return "pending";
  if (sub.end_date && sub.end_date <= today) return "expired";
  return "active";
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-yellow-100 text-yellow-700",
  revoked: "bg-red-100 text-red-700",
  pending: "bg-blue-100 text-blue-700",
};

const PRODUCT_STYLES: Record<string, string> = {
  DIGITAL: "bg-sky-100 text-sky-700",
  PRINT: "bg-violet-100 text-violet-700",
  PREMIUM: "bg-amber-100 text-amber-700",
};

// ─── Grant subscription form ──────────────────────────────────────────────────

function GrantForm({ userId, onGranted }: { userId: number; onGranted: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [product, setProduct] = useState("DIGITAL");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.subscriptions.create({
        user: userId,
        product,
        start_date: startDate,
        ...(endDate ? { end_date: endDate } : {}),
      });
      onGranted();
      setProduct("DIGITAL");
      setStartDate(today);
      setEndDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant subscription");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Product *</label>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="DIGITAL">DIGITAL</option>
            <option value="PRINT">PRINT</option>
            <option value="PREMIUM">PREMIUM</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
          <input
            required
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            End Date <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Granting…" : "Grant Subscription"}
      </button>
    </form>
  );
}

// ─── Subscription row ─────────────────────────────────────────────────────────

function SubscriptionRow({
  sub,
  onRevoke,
  onDelete,
}: {
  sub: Subscription;
  onRevoke: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const status = subStatus(sub);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleRevoke() {
    if (!confirm("Revoke this subscription? This cannot be undone.")) return;
    setRevoking(true);
    try {
      await api.subscriptions.revoke(sub.id);
      onRevoke(sub.id);
    } finally {
      setRevoking(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Permanently delete this subscription record?")) return;
    setDeleting(true);
    try {
      await api.subscriptions.delete(sub.id);
      onDelete(sub.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{sub.id}</td>
      <td className="px-4 py-3">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRODUCT_STYLES[sub.product]}`}
        >
          {sub.product}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{sub.start_date}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{sub.end_date ?? "No expiry"}</td>
      <td className="px-4 py-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
          {status}
        </span>
      </td>
      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
        {status !== "revoked" && (
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="text-xs text-orange-600 hover:text-orange-800 font-medium disabled:opacity-50"
          >
            {revoking ? "Revoking…" : "Revoke"}
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);

  const [user, setUser] = useState<User | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [u, e, subs] = await Promise.all([
        api.users.get(userId),
        api.users.entitlements(userId),
        api.subscriptions.list({ user: String(userId) }),
      ]);
      setUser(u);
      setEntitlements(e);
      setSubscriptions(subs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleRevoke(id: number) {
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, revoked_at: new Date().toISOString() } : s))
    );
    refresh();
  }

  function handleDelete(id: number) {
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    refresh();
  }

  if (loading) {
    return <div className="text-gray-400 text-sm py-12 text-center">Loading…</div>;
  }

  if (error || !user || !entitlements) {
    return (
      <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
        {error ?? "User not found"}
      </div>
    );
  }

  const { can_read_web, can_receive_print, ad_free } = entitlements.entitlements;

  return (
    <div className="space-y-8">
      {/* Back + header */}
      <div>
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
          ← Back to Users
        </Link>
        <div className="mt-3 flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{user.username}</h1>
          {user.email && <span className="text-gray-500 text-sm">{user.email}</span>}
          <span className="text-gray-300 text-xs font-mono">ID {user.id}</span>
        </div>
      </div>

      {/* Entitlements */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
          Current Entitlements
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <EntitlementBadge label="Can Read Web" active={can_read_web} />
          <EntitlementBadge label="Receives Print" active={can_receive_print} />
          <EntitlementBadge label="Ad-Free" active={ad_free} />
        </div>
        {entitlements.active_subscriptions.length === 0 && (
          <p className="text-xs text-gray-400">No active subscriptions — all entitlements off.</p>
        )}
      </section>

      {/* Subscriptions table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
          All Subscriptions
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          {subscriptions.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No subscriptions yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-12">ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Start</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">End</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="w-32 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub) => (
                  <SubscriptionRow
                    key={sub.id}
                    sub={sub}
                    onRevoke={handleRevoke}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Grant form */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
          Grant New Subscription
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <GrantForm userId={userId} onGranted={refresh} />
        </div>
      </section>
    </div>
  );
}
