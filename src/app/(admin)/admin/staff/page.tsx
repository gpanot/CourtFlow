"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Plus, Shield, User, Pencil, Trash2, KeyRound, X, Check } from "lucide-react";

interface StaffVenue {
  id: string;
  name: string;
}

interface Staff {
  id: string;
  name: string;
  phone: string;
  role: string;
  venues: StaffVenue[];
  createdAt: string;
}

type ModalMode = null | "create" | "edit" | "delete" | "reset-password";

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [venues, setVenues] = useState<StaffVenue[]>([]);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    role: "staff" as "staff" | "superadmin",
    venueIds: [] as string[],
  });
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const fetchAll = async () => {
    const [s, v] = await Promise.all([
      api.get<Staff[]>("/api/admin/staff"),
      api.get<StaffVenue[]>("/api/venues"),
    ]);
    setStaff(s);
    setVenues(v);
  };

  useEffect(() => {
    fetchAll().catch(console.error);
  }, []);

  const openCreate = () => {
    setForm({ name: "", phone: "", password: "", role: "staff", venueIds: [] });
    setErr("");
    setModalMode("create");
  };

  const openEdit = (s: Staff) => {
    setSelectedStaff(s);
    setForm({
      name: s.name,
      phone: s.phone,
      password: "",
      role: s.role as "staff" | "superadmin",
      venueIds: s.venues.map((v) => v.id),
    });
    setErr("");
    setModalMode("edit");
  };

  const openDelete = (s: Staff) => {
    setSelectedStaff(s);
    setErr("");
    setModalMode("delete");
  };

  const openResetPassword = (s: Staff) => {
    setSelectedStaff(s);
    setNewPassword("");
    setErr("");
    setModalMode("reset-password");
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedStaff(null);
    setErr("");
  };

  const toggleVenue = (venueId: string) => {
    setForm((prev) => ({
      ...prev,
      venueIds: prev.venueIds.includes(venueId)
        ? prev.venueIds.filter((id) => id !== venueId)
        : [...prev.venueIds, venueId],
    }));
  };

  const handleCreate = async () => {
    if (!form.name || !form.phone || !form.password) { setErr("Name, phone, and password are required"); return; }
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/admin/staff", {
        name: form.name,
        phone: form.phone,
        password: form.password,
        role: form.role,
        venueIds: form.venueIds,
      });
      await fetchAll();
      closeModal();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedStaff || !form.name) { setErr("Name is required"); return; }
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/api/admin/staff/${selectedStaff.id}`, {
        name: form.name,
        role: form.role,
        venueIds: form.venueIds,
      });
      await fetchAll();
      closeModal();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedStaff) return;
    setSaving(true);
    setErr("");
    try {
      await api.delete(`/api/admin/staff/${selectedStaff.id}`);
      await fetchAll();
      closeModal();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedStaff || !newPassword) { setErr("Password is required"); return; }
    if (newPassword.length < 4) { setErr("Password must be at least 4 characters"); return; }
    setSaving(true);
    setErr("");
    try {
      await api.post(`/api/admin/staff/${selectedStaff.id}/reset-password`, { newPassword });
      closeModal();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Staff Management</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
        >
          <Plus className="h-4 w-4" /> Add Staff
        </button>
      </div>

      {/* Staff list */}
      <div className="space-y-3">
        {staff.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {s.role === "superadmin" ? (
                    <Shield className="h-4 w-4 text-purple-400 shrink-0" />
                  ) : (
                    <User className="h-4 w-4 text-blue-400 shrink-0" />
                  )}
                  <span className="font-semibold truncate">{s.name}</span>
                  <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 capitalize">{s.role}</span>
                </div>
                <p className="text-sm text-neutral-500 mb-2">{s.phone}</p>
                <div className="flex flex-wrap gap-1">
                  {s.venues.length === 0 && (
                    <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-500">No venue assigned</span>
                  )}
                  {s.venues.map((v) => (
                    <span key={v.id} className="rounded bg-blue-600/15 px-2 py-0.5 text-xs text-blue-400">{v.name}</span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEdit(s)}
                  className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-white"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openResetPassword(s)}
                  className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-amber-400"
                  title="Reset Password"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openDelete(s)}
                  className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {staff.length === 0 && (
          <p className="py-12 text-center text-neutral-500">No staff members yet</p>
        )}
      </div>

      {/* Create / Edit modal */}
      {(modalMode === "create" || modalMode === "edit") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">
                {modalMode === "create" ? "Add Staff Member" : `Edit ${selectedStaff?.name}`}
              </h3>
              <button onClick={closeModal} className="text-neutral-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {err && <p className="mb-3 rounded-lg bg-red-900/30 p-2 text-sm text-red-400">{err}</p>}

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
              />

              {modalMode === "create" && (
                <>
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                  />
                </>
              )}

              <div>
                <label className="mb-1.5 block text-sm text-neutral-400">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as "staff" | "superadmin" })}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="staff">Staff</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-neutral-400">Venues</label>
                <div className="flex flex-wrap gap-2">
                  {venues.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => toggleVenue(v.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        form.venueIds.includes(v.id)
                          ? "border-purple-500 bg-purple-600/20 text-purple-300"
                          : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                      )}
                    >
                      {form.venueIds.includes(v.id) && <Check className="h-3 w-3" />}
                      {v.name}
                    </button>
                  ))}
                  {venues.length === 0 && (
                    <p className="text-sm text-neutral-500">No venues available</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={modalMode === "create" ? handleCreate : handleEdit}
                disabled={saving}
                className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : modalMode === "create" ? "Create" : "Save Changes"}
              </button>
              <button
                onClick={closeModal}
                className="rounded-xl bg-neutral-800 px-6 py-3 text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {modalMode === "delete" && selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-red-600/20 p-3">
                <Trash2 className="h-6 w-6 text-red-400" />
              </div>
              <h3 className="text-lg font-bold">Delete {selectedStaff.name}?</h3>
              <p className="text-sm text-neutral-400">
                This will permanently remove this staff member. They will no longer be able to log in.
              </p>
            </div>

            {err && <p className="mb-3 rounded-lg bg-red-900/30 p-2 text-sm text-red-400">{err}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {saving ? "Deleting..." : "Yes, Delete"}
              </button>
              <button
                onClick={closeModal}
                className="flex-1 rounded-xl bg-neutral-800 py-3 text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password */}
      {modalMode === "reset-password" && selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Reset Password</h3>
              <button onClick={closeModal} className="text-neutral-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-neutral-400 mb-4">
              Set a new password for <strong>{selectedStaff.name}</strong>
            </p>

            {err && <p className="mb-3 rounded-lg bg-red-900/30 p-2 text-sm text-red-400">{err}</p>}

            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
              className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
            />

            <div className="flex gap-3">
              <button
                onClick={handleResetPassword}
                disabled={saving || !newPassword}
                className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {saving ? "Resetting..." : "Reset Password"}
              </button>
              <button
                onClick={closeModal}
                className="rounded-xl bg-neutral-800 px-6 py-3 text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
