export function formatOperationsLoadError(status?: number, message?: string) {
  const suffix = status ? ` HTTP ${status}` : "";
  const detail = message?.trim() ? ` ${message.trim()}` : "";
  return `Operations panel unavailable.${suffix}${detail}`;
}
