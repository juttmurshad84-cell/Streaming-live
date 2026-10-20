"use client";
import { useEffect } from "react";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="container-page grid min-h-[50vh] place-items-center py-20 text-center">
      <div>
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-muted">An unexpected error occurred. {error.digest && <span className="font-mono text-xs">Ref: {error.digest}</span>}</p>
        <button onClick={reset} className="btn-primary mt-6">Try again</button>
      </div>
    </div>
  );
}
