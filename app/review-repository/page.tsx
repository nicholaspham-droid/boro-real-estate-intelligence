import { FeedbackRepository } from "./FeedbackRepository";
import { env } from "cloudflare:workers";
import Link from "next/link";
import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";
import "./roadmap.css";
import "./priority-roadmap.css";

export const dynamic = "force-dynamic";

export default async function ReviewRepositoryPage() {
  const user = await requireChatGPTUser("/review-repository");
  const runtimeEnv = env as unknown as { FEEDBACK_ADMIN_EMAIL?: string };
  const allowedEmail = runtimeEnv.FEEDBACK_ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowedEmail || user.email.trim().toLowerCase() !== allowedEmail) {
    return <main className="repository-lock"><span>BORO · OWNER REPOSITORY</span><h1>This ChatGPT account is not authorized.</h1><p>Sign out, then use the owner account named in the private access email.</p><Link href={chatGPTSignOutPath("/review-repository")}>Sign out and try another account →</Link></main>;
  }
  return <FeedbackRepository ownerEmail={user.email} />;
}
