export const appConfig = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Arenas Transporte y Turismo",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.arenastransporte.com",
  validationUrl:
    process.env.NEXT_PUBLIC_PUBLIC_VALIDATION_URL ??
    "https://arenastransporte.com/validar"
};
