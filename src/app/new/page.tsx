import { requireUser } from "@/lib/auth";
import { NewQuestionForm } from "@/components/NewQuestionForm";

export default async function NewPage() {
  await requireUser();
  return (
    <div className="section">
      <h1 className="page-title">New market</h1>
      <p className="page-sub">
        Ask the crowd. You earn 1 credit for every question you post. Admins verify the outcome and remove posts that
        break protocol.
      </p>
      <NewQuestionForm />
    </div>
  );
}
