import { createClient } from "@/lib/supabase/server";
import { Invitation } from "@/components/access/invitation";
import { tryGetEnv } from "@/lib/env";
import { requireAlphaUser, releaseStage } from "@/lib/private-alpha";
export const dynamic = "force-dynamic";
export default async function InvitationPage() {
  const privateAlpha = releaseStage() === "private_alpha";
  if (!tryGetEnv())
    return <Invitation signedIn={false} privateAlpha={privateAlpha} />;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let allowed = !!user;
  try {
    requireAlphaUser(user);
  } catch {
    allowed = false;
  }
  return <Invitation signedIn={allowed} privateAlpha={privateAlpha} />;
}
