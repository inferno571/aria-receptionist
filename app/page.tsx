import { requireUser } from "@/lib/auth";
import Receptionist from "./receptionist";
export const dynamic = "force-dynamic";
export default async function Home() {
  await requireUser();
  return <Receptionist />;
}
