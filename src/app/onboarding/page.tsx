import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UsernameForm } from "@/components/AuthForm";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.username) redirect("/");
  return <UsernameForm email={user.email} />;
}
