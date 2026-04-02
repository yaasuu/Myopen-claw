import { redirect } from "next/navigation";

export default function MemoryRedirect() {
  redirect("/notes");
}
