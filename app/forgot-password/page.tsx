import type { Metadata } from "next";
import { ForgotPasswordPanel } from "@/components/password-reset-panels";
import { issueFormToken } from "@/lib/bot-trap";
// Rendered per request so each visitor gets a freshly timed bot-trap token.
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Forgot password"};
export default function ForgotPasswordPage(){const secret=process.env.SESSION_SECRET;return <ForgotPasswordPanel formToken={secret?issueFormToken(secret):null}/>;}
