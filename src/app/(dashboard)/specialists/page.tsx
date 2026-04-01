import { redirect } from "next/navigation";

export default function SpecialistsRedirect() {
  redirect("/workforce?view=specialists");
}
