import "server-only";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { alertRecipients, brandSignupAlert } from "@/lib/brand-signup-alert";
import { SES_SEND_TIMEOUT_MS } from "@/lib/server/password-reset-email";

const region=process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2";

/**
 * Tells the owner a brand registered (lib/brand-signup-alert.ts). Best-effort: it never fails or
 * delays a registration by more than the SES timeout, and a failure is logged by name only, never
 * with an address. Off unless RACKED_BRAND_ALERT_TO is set; it sends from RACKED_BRAND_ALERT_FROM,
 * or the password-reset sender, which must be an SES-verified identity.
 */
export async function notifyOwnerOfBrandSignup(input:{accountId:string;brandName:string;email:string;createdAt:string}){
  const to=alertRecipients(process.env.RACKED_BRAND_ALERT_TO);
  const from=(process.env.RACKED_BRAND_ALERT_FROM??process.env.RACKED_PASSWORD_RESET_FROM)?.trim();
  if(!to.length||!from)return false;
  const alert=brandSignupAlert(input);
  try{
    await new SESv2Client({region}).send(new SendEmailCommand({
      FromEmailAddress:from,
      Destination:{ToAddresses:to},
      Content:{Simple:{Subject:{Data:alert.subject,Charset:"UTF-8"},Body:{Text:{Data:alert.body,Charset:"UTF-8"}}}},
    }),{abortSignal:AbortSignal.timeout(SES_SEND_TIMEOUT_MS)});
    return true;
  }catch(error){
    console.error("Brand sign-up alert not sent",{name:error instanceof Error?error.name:"UnknownError"});
    return false;
  }
}
