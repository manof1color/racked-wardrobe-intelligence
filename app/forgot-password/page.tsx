import type { Metadata } from "next";
import { ForgotPasswordPanel } from "@/components/password-reset-panels";
export const metadata:Metadata={title:"Forgot password"};
export default function ForgotPasswordPage(){return <ForgotPasswordPanel/>;}
