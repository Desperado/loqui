import type { Metadata } from "next";
import { Humanizer } from "@/components/Humanizer";

export const metadata: Metadata = {
  title: "Humanize writing — Loqui",
  description: "Make a draft clearer and more natural with fast, open models.",
};

export default function HumanizePage() {
  return <Humanizer />;
}
