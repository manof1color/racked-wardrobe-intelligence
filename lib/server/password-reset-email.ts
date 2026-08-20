import "server-only";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const region=process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2";

export async function sendPasswordResetEmail(input:{email:string;resetUrl:string}) {
  const from=process.env.RACKED_PASSWORD_RESET_FROM?.trim();
  if(!from)throw new Error("RACKED_PASSWORD_RESET_FROM is not configured.");
  await new SESv2Client({region}).send(new SendEmailCommand({
    FromEmailAddress:from,
    Destination:{ToAddresses:[input.email]},
    Content:{Simple:{Subject:{Data:"Reset your Racked password",Charset:"UTF-8"},Body:{Text:{Data:`A password reset was requested for your Racked account. This single-use link expires in 30 minutes:\n\n${input.resetUrl}\n\nIf you did not request this, you can ignore this email.`,Charset:"UTF-8"}}}},
  }));
}
