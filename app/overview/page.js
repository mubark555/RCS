"use client";

import Overview from "@/components/Overview";
import Guard from "@/components/Guard";

export default function OverviewPage() {
  return <Guard perm="page.overview"><Overview /></Guard>;
}
