import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChildLandingClient from "./ChildLandingClient";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

interface ChildLandingPageProps {
  params: { locale: string };
}

export default async function ChildLandingPage({
  params,
}: ChildLandingPageProps) {
  const { locale } = params;
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect(`/${locale}/child-login`);
  }

  const { data: childRow } = await supabase
    .from("children")
    .select("id")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!childRow) {
    redirect(`/${locale}/login`);
  }

  const [homeworkResponse, checkInResponse] = await Promise.all([
    supabase.from("homeworks").select("*").eq("child_id", session.user.id),
    supabase
      .from("check_ins")
      .select("*")
      .eq("child_id", session.user.id)
      .order("completed_at", { ascending: true }),
  ]);

  const homeworks = (homeworkResponse.data ?? []) as Homework[];
  const checkIns = (checkInResponse.data ?? []) as CheckIn[];

  return (
    <ChildLandingClient
      initialHomeworks={homeworks}
      initialCheckIns={checkIns}
      locale={locale}
    />
  );
}
