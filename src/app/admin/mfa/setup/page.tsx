import QRCode from "qrcode";
import { ensurePendingSecret } from "../actions";
import { MfaForm } from "../MfaForm";
import { getSessionUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function MfaSetup() {
  const secret = await ensurePendingSecret();
  const user = await getSessionUser();
  const uri = `otpauth://totp/DrEnsiyeh:${encodeURIComponent(user?.email ?? "staff")}?secret=${secret}&issuer=DrEnsiyeh&algorithm=SHA1&digits=6&period=30`;
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 200 });
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl text-ink">Set up two-factor authentication</h1>
        <p className="mt-2 text-sm text-ink-soft">Staff accounts require an authenticator app (Google Authenticator, 1Password, Microsoft Authenticator). Scan the code, then enter the 6-digit code.</p>
        <div className="mx-auto mt-6 w-[200px]" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-4 break-all rounded-xl bg-sage p-3 text-center font-mono text-xs text-ink-soft">{secret.match(/.{1,4}/g)?.join(" ")}</p>
        <MfaForm mode="enrol" />
      </div>
    </div>
  );
}
