"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { interviewTurn } from "@/lib/services/conversation";
import { getEntitlements } from "@/lib/services/entitlements-repo";

/** Démarre une conversation d'interview (ou sur une photo). */
export async function startInterview(form: FormData) {
  const { supabase, user } = await requireUser();
  const ent = await getEntitlements(user.id);
  if (!ent.can_add_content) redirect("/talk?error=preservation");

  const prompt = String(form.get("prompt") ?? "").trim().slice(0, 500);
  const mediaId = String(form.get("media_id") ?? "") || null;

  const { data: session, error } = await supabase
    .from("conversation_sessions")
    .insert({
      user_id: user.id,
      subject_user_id: user.id,
      kind: mediaId ? "photo_story" : "interview",
      channel: "text",
      media_id: mediaId,
      title: prompt || null,
    })
    .select("id, user_id, subject_user_id, kind, media_id")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Could not start the conversation");

  if (prompt && !mediaId) {
    await supabase.from("conversation_messages").insert({ session_id: session.id, user_id: user.id, role: "assistant", content: prompt });
  } else {
    await interviewTurn(supabase, user.id, session, null);
  }
  redirect(`/talk/${session.id}`);
}

/** Démarre une conversation avec un Still Here (le sien ou celui d'un proche). */
export async function startDigitalSelf(form: FormData) {
  const { supabase, user } = await requireUser();
  const ownerId = String(form.get("owner_id") ?? user.id);
  const isSelf = ownerId === user.id;
  const { data: session, error } = await supabase
    .from("conversation_sessions")
    .insert({ user_id: user.id, subject_user_id: ownerId, kind: isSelf ? "meet_self" : "loved_one", channel: "text" })
    .select("id")
    .single();
  if (error || !session) redirect(isSelf ? "/meet?error=start" : "/shared?error=access");
  redirect(isSelf ? `/meet/${session.id}` : `/shared/${ownerId}/${session.id}`);
}
