type ErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type ErrorEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: ErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __SysPanelWikiEvents?: ErrorEvents;
    __SysPanelWikiReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

export function reportSysPanelWikiError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__SysPanelWikiEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );

  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  window.__SysPanelWikiReportRuntimeError?.({
    message,
    stack: error instanceof Error ? error.stack : undefined,
    filename: window.location.pathname,
  });
}
