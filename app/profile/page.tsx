import { chatGPTSignOutPath, getChatGPTUser } from "../chatgpt-auth";
import { ProfileWorkspace } from "./ProfileWorkspace";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getChatGPTUser();
  return (
    <ProfileWorkspace
      initialIdentity={user ? { displayName: user.displayName, email: user.email } : null}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
