import type { Metadata } from "next";
import { NewPasswordPanel } from "@/components/password-reset-panels";
export const metadata:Metadata={title:"Choose a new password"};
export default async function ResetPasswordPage({searchParams}:{searchParams:Promise<{token?:string}>}){const query=await searchParams;return <NewPasswordPanel token={(query.token??"").slice(0,200)}/>;}
