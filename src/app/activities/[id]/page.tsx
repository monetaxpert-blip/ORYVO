"use client";

import { useParams } from "next/navigation";
import ActivityDetail from "@/components/ActivityDetail";

export default function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  return <ActivityDetail activityId={id} />;
}
