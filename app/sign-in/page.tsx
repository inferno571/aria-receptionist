import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import SignInForm from "./sign-in-form";
export const dynamic = "force-dynamic";
export default async function SignIn() {
  if (await getUser()) redirect("/");
  return <SignInForm />;
}
