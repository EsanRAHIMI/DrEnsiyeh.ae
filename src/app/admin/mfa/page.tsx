import { MfaForm } from "./MfaForm";

export default function Mfa() {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-2xl text-ink">Verify it&apos;s you</h1>
        <p className="mt-2 text-sm text-ink-soft">Enter the 6-digit code from your authenticator app.</p>
        <MfaForm mode="verify" />
      </div>
    </div>
  );
}
