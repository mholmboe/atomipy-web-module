import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const DISMISS_KEY = "atomipy_coldstart_dismissed";

/**
 * One-time, dismissible banner explaining Cloud Run cold starts.
 *
 * Shown ONLY on the online Cloud Run site — the backend reports `coldStart:
 * true` when the `K_SERVICE` env var is present (Cloud Run injects it). On
 * Google Colab and local dev that flag is false, so the banner never appears.
 * Once dismissed it is remembered in localStorage and won't show again.
 */
export default function ColdStartNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* localStorage unavailable — just proceed */
    }
    fetch("/api/presets")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.coldStart) setShow(true);
      })
      .catch(() => {
        /* ignore — no banner if we can't reach the backend */
      });
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <p className="flex-1 leading-snug">
        <span className="font-semibold">Heads up:</span> this site runs on free,
        scale-to-zero cloud hosting to keep it available at no cost. After a quiet
        period the first action may take ~15–40&nbsp;s while the server “wakes up”
        (a cold start) — please be patient. It’s fast once running. For heavy GPU
        simulations, use the Google&nbsp;Colab launcher or a local install.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="mt-0.5 flex-shrink-0 rounded p-0.5 text-amber-700/70 transition-colors hover:text-amber-700 dark:text-amber-300/70 dark:hover:text-amber-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
