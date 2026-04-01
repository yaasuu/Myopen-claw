import { redirect } from "next/navigation";

export default function DepartmentsRedirect() {
  redirect("/workforce?view=departments");
}
