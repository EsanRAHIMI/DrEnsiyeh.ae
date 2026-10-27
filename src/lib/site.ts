export const SITE_URL = "https://drensiyeh.ae";
export const baseUrl = () => process.env.APP_BASE_URL ?? SITE_URL;
export const isIndexable = () => process.env.DEPLOY_ENV === "production";
