/**
 * Delivery adapters. Each is a thin wrapper around an official API:
 *  - WhatsApp: Meta WhatsApp Business Platform (Cloud API) with pre-approved templates only.
 *  - Email: any SMTP-less HTTP provider (Resend-compatible API) or console in development.
 *  - SMS: Twilio-compatible REST API.
 * In development/sandbox every adapter falls back to the console transport.
 */
export type OutboundMessage = {
  to: string;
  subject: string;
  text: string;
  whatsappTemplate?: string;
  params: Record<string, string>;
};

export interface ChannelAdapter {
  send(msg: OutboundMessage): Promise<string>;
}

export type ChannelAdapters = Partial<Record<"email" | "whatsapp" | "sms", ChannelAdapter>>;

export const consoleAdapter = (channel: string): ChannelAdapter => ({
  async send(msg) {
    // Development transport: prints the privacy-safe message only.
    console.info(`[notify:${channel}] to=${redact(msg.to)} subject="${msg.subject}"\n${msg.text}`);
    return `console-${Date.now()}`;
  },
});

function redact(address: string) {
  return address.replace(/^(.{2}).*(@.*|.{2})$/, "$1***$2");
}

export const emailAdapter = (): ChannelAdapter => {
  const key = process.env.EMAIL_API_KEY;
  if (!key) return consoleAdapter("email");
  return {
    async send(msg) {
      const res = await fetch(process.env.EMAIL_API_URL ?? "https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
      });
      if (!res.ok) throw new Error(`email provider ${res.status}`);
      const body = (await res.json()) as { id?: string };
      return body.id ?? "email";
    },
  };
};

export const whatsappAdapter = (): ChannelAdapter => {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return consoleAdapter("whatsapp");
  return {
    async send(msg) {
      if (!msg.whatsappTemplate) throw new Error("No approved WhatsApp template for this message");
      const version = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";
      const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.to.replace(/[^\d]/g, ""),
          type: "template",
          template: {
            name: msg.whatsappTemplate,
            language: { code: "en" },
            components: [
              { type: "body", parameters: Object.values(msg.params).map((text) => ({ type: "text", text })) },
            ],
          },
        }),
      });
      if (!res.ok) throw new Error(`whatsapp ${res.status}`);
      const body = (await res.json()) as { messages?: { id: string }[] };
      return body.messages?.[0]?.id ?? "whatsapp";
    },
  };
};

export const smsAdapter = (): ChannelAdapter => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return consoleAdapter("sms");
  return {
    async send(msg) {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: msg.to, From: from, Body: msg.text }),
      });
      if (!res.ok) throw new Error(`sms ${res.status}`);
      const body = (await res.json()) as { sid?: string };
      return body.sid ?? "sms";
    },
  };
};

export function defaultAdapters(whatsappLive: boolean): ChannelAdapters {
  return { email: emailAdapter(), sms: smsAdapter(), whatsapp: whatsappLive ? whatsappAdapter() : consoleAdapter("whatsapp") };
}
