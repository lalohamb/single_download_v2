"use client";
import { useEffect } from "react";
import { recordAttribution, getAttribution } from "@/lib/attribution";

export default function AttributionTracker() {
  useEffect(() => {
    recordAttribution();
    const { first_touch, last_touch } = getAttribution();
    window.__attribution = { first_touch, last_touch };
  }, []);

  return null;
}
