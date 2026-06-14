export const ADMIN_DASHBOARD_REFRESH_EVENT = "courtflow:admin-dashboard-refresh";

export const ADMIN_DASHBOARD_POLL_MS = 10_000;

export function dispatchAdminDashboardRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ADMIN_DASHBOARD_REFRESH_EVENT));
  }
}
