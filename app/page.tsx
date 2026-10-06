import { requireChatGPTUser } from "./chatgpt-auth";
import Receptionist from "./receptionist";
export const dynamic = "force-dynamic";
export default async function Home() {
  await requireChatGPTUser("/");
  return <Receptionist />;
}
