export async function printAppRoute(route: string): Promise<{ ok: boolean; error?: string }> {
  if (window.desktopAPI?.print) {
    return window.desktopAPI.print.route(route);
  }

  const url = `${window.location.origin}${window.location.pathname}#${route}`;
  const popup = window.open(url, "_blank");
  return popup ? { ok: true } : { ok: false, error: "popup_blocked" };
}
