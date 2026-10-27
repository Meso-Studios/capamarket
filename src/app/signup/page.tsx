import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "@/components/AuthForm";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  return <SignupForm />;
}
