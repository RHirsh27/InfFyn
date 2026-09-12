import { LoginForm } from "@/components/access/login";
import { releaseStage } from "@/lib/private-alpha";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <LoginForm privateAlpha={releaseStage() === "private_alpha"} />;
}
