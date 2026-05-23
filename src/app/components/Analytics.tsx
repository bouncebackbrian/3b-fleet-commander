"use client";

import { useEffect } from "react";
import Clarity from "@microsoft/clarity";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function GoogleAnalytics({ id }: { id: string }) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    script.async = true;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function (...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", id);

    return () => {
      document.head.removeChild(script);
    };
  }, [id]);

  return null;
}

export function MicrosoftClarity({ id }: { id: string }) {
  useEffect(() => {
    Clarity.init(id);
  }, [id]);

  return null;
}
