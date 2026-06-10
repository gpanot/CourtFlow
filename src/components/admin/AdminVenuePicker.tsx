"use client";

/**
 * AdminVenuePicker
 *
 * Single shared venue dropdown for all admin pages.
 * - Fetches venues from GET /api/admin/venues (auth-scoped — only the caller's venues)
 * - Persists the selected venue ID in useAdminVenueStore (localStorage)
 * - Exposes the venue list so callers can derive extra data (e.g. venue name, settings)
 *
 * Usage:
 *   const { venueId, setVenueId, venues } = useAdminVenuePicker();
 *   <AdminVenuePicker venueId={venueId} venues={venues} onChange={setVenueId} />
 *
 * Or use the hook alone without rendering the picker when you need the list + stored ID.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useAdminVenueStore } from "@/stores/admin-venue-store";

export interface AdminVenueOption {
  id: string;
  name: string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseAdminVenuePickerOptions {
  /** When true, auto-selects the first venue if no venue is currently stored. Default: false */
  autoSelect?: boolean;
  /** Optional callback fired once venues have loaded */
  onVenuesLoaded?: (venues: AdminVenueOption[]) => void;
}

export function useAdminVenuePicker(opts: UseAdminVenuePickerOptions = {}) {
  const { selectedVenueId: storedId, setSelectedVenueId: storeId } = useAdminVenueStore();
  const [venues, setVenues] = useState<AdminVenueOption[]>([]);
  const [venueId, _setVenueId] = useState<string>(storedId ?? "");

  const setVenueId = useCallback(
    (id: string) => {
      _setVenueId(id);
      storeId(id);
    },
    [storeId]
  );

  useEffect(() => {
    api
      .get<AdminVenueOption[]>("/api/admin/venues")
      .then((data) => {
        // API returns full venue objects — keep only id + name
        const list: AdminVenueOption[] = data.map((v) => ({ id: v.id, name: v.name }));
        setVenues(list);
        opts.onVenuesLoaded?.(list);

        const ids = list.map((v) => v.id);
        _setVenueId((prev) => {
          if (prev && !ids.includes(prev)) {
            storeId("");
            return "";
          }
          if (!prev && opts.autoSelect && list.length > 0) {
            storeId(list[0].id);
            return list[0].id;
          }
          return prev;
        });
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { venueId, setVenueId, venues };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AdminVenuePickerProps {
  venueId: string;
  venues: AdminVenueOption[];
  onChange: (id: string) => void;
  /** Placeholder shown when no venue is selected. Default: "Select venue…" */
  placeholder?: string;
  /** Show an "All venues" option (value = ""). Default: false */
  allowAll?: boolean;
  className?: string;
}

export function AdminVenuePicker({
  venueId,
  venues,
  onChange,
  placeholder = "Select venue…",
  allowAll = false,
  className,
}: AdminVenuePickerProps) {
  return (
    <select
      value={venueId}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
      }
    >
      {allowAll ? (
        <option value="">All venues</option>
      ) : (
        !venueId && <option value="">{placeholder}</option>
      )}
      {venues.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  );
}
