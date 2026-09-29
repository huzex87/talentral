// Server configuration read once from the environment.
export const env = {
  appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  rootDomain: process.env.ROOT_DOMAIN || null,
  mailDriver: (process.env.MAIL_DRIVER ?? 'console') as 'console' | 'file' | 'resend',
  mailFrom: process.env.MAIL_FROM ?? 'Talentral <no-reply@talentral.ng>',
  resendKey: process.env.RESEND_API_KEY ?? '',
  storageDriver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
  production: process.env.NODE_ENV === 'production',
};
