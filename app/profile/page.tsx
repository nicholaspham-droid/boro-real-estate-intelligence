import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";
import { ProfileWorkspace } from "./ProfileWorkspace";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireChatGPTUser("/profile");

  return (
    <ProfileWorkspace
      identity={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
