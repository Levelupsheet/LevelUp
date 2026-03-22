import { Suspense } from "react";
import PayPalSuccessClient from "./PayPalSuccessClient";

type PageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

export default async function PayPalSuccessPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const orderId = String(params.token || "").trim();

  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#050914",
            color: "#fff",
            padding: 24,
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 24,
              padding: 24,
              background: "rgba(9,14,28,0.92)",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 28 }}>PayPal checkout</h1>
            <p style={{ opacity: 0.86, marginTop: 12 }}>Completing your PayPal purchase...</p>
            <div style={{ opacity: 0.72 }}>Please wait…</div>
          </div>
        </main>
      }
    >
      <PayPalSuccessClient orderId={orderId} />
    </Suspense>
  );
}