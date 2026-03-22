"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    paypal?: any;
  }
}

type Plan = "PRO" | "PREMIUM";

type Props = {
  plan: Plan;
  onSuccess?: () => void;
};

const PLAN_IDS: Record<Plan, string> = {
  PRO: process.env.NEXT_PUBLIC_PAYPAL_PRO_PLAN_ID || "P-0L833853TV738062GNG7XKAI",
  PREMIUM: process.env.NEXT_PUBLIC_PAYPAL_PREMIUM_PLAN_ID || "P-44119510FD537603NNG7XNMQ",
};

export default function PayPalSubscriptionButton({ plan, onSuccess }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const planId = useMemo(() => PLAN_IDS[plan], [plan]);

  useEffect(() => {
    renderedRef.current = false;
    setError("");
  }, [plan]);

  useEffect(() => {
    let cancelled = false;

    async function waitForPaypal() {
      const started = Date.now();
      while (!cancelled && !window.paypal && Date.now() - started < 10000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      if (cancelled) return;
      if (!containerRef.current) return;
      if (renderedRef.current) return;
      if (!window.paypal?.Buttons) {
        setError("PayPal SDK did not load.");
        return;
      }
      if (!planId) {
        setError(`Missing plan id for ${plan}.`);
        return;
      }
      renderedRef.current = true;
      try {
        containerRef.current.innerHTML = "";
        window.paypal
          .Buttons({
            style: {
              shape: "pill",
              color: "black",
              layout: "horizontal",
              label: "subscribe",
            },
            createSubscription(_data: any, actions: any) {
              return actions.subscription.create({ plan_id: planId });
            },
            async onApprove(data: any) {
              const subscriptionId = String(data?.subscriptionID || "").trim();
              if (!subscriptionId) {
                setError("Missing PayPal subscription id.");
                return;
              }
              try {
                setBusy(true);
                setError("");
                const res = await fetch("/api/billing/paypal/activate-subscription", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ subscriptionId, plan }),
                });
                const json = await res.json().catch(() => null);
                if (!res.ok || !json?.ok) {
                  throw new Error(String(json?.error || "Failed to activate subscription."));
                }
                onSuccess?.();
                router.replace("/dashboard");
                router.refresh();
              } catch (err: any) {
                setError(err?.message || "Error activating subscription");
              } finally {
                setBusy(false);
              }
            },
            onError(err: any) {
              setError(err?.message || "PayPal checkout failed.");
            },
          })
          .render(containerRef.current);
      } catch (err: any) {
        setError(err?.message || "Unable to render PayPal button.");
      }
    }

    waitForPaypal();
    return () => {
      cancelled = true;
    };
  }, [plan, planId, onSuccess, router]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div ref={containerRef} id={`paypal-subscribe-${plan.toLowerCase()}`} />
      {busy ? <div className="muted">Finalizing subscription…</div> : null}
      {error ? <div className="muted" style={{ color: "#ffb4b4" }}>{error}</div> : null}
    </div>
  );
}
