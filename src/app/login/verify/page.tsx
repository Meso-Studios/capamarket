import { redirect } from "next/navigation";
import { AdminCodeForm } from "@/components/AuthForm";
import { ADMIN_EMAIL } from "@/lib/mail";
import { pendingChallengeUser } from "@/lib/twofactor";

export const dynamic = "force-dynamic";

/** Masks the 2FA inbox, e.g. pi•••••••••••••es@gmail.com. */
function mask(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 4))}${name.slice(-2)}@${domain}`;
}

export default async function VerifyPage() {
  if (!(await pendingChallengeUser())) redirect("/login");
  return <AdminCodeForm email={mask(ADMIN_EMAIL)} />;
}
