/**
 * Shared email layout wrapper for all IGU edge functions.
 *
 * All styles are inline — never use <style> blocks (Gmail strips them).
 * Never use display:flex — Outlook doesn't support it.
 * Use <table role="presentation"> for all layouts.
 */

import { APP_BASE_URL, SUPPORT_EMAIL } from './config.ts';

// ── Brand Constants ──────────────────────────────────────────────────────────

export const EMAIL_BRAND = {
  // Primary
  red: '#d91449',
  redDark: '#b8113e',
  dark: '#09090B',
  white: '#FAFAFA',

  // Gray scale
  gray100: '#F4F4F5',
  gray200: '#E4E4E7',
  gray300: '#D4D4D8',
  gray400: '#A1A1AA',
  gray500: '#71717A',
  gray600: '#52525B',

  // Semantic
  success: '#16a34a',
  successBg: '#f0fdf4',
  warning: '#d97706',
  warningBg: '#fffbeb',
  error: '#dc2626',
  errorBg: '#fef2f2',
  info: '#2563eb',
  infoBg: '#eff6ff',

  // Text
  heading: '#2d3748',
  body: '#4a5568',
  muted: '#718096',
  light: '#a0aec0',

  // URLs
  logoUrl: 'https://theigu.com/android-chrome-192x192.png',
  siteUrl: APP_BASE_URL,
  supportEmail: SUPPORT_EMAIL,

  // Social
  instagramUrl: 'https://instagram.com/theigu.kw',
  tiktokUrl: 'https://tiktok.com/@theigu.kw',
  youtubeUrl: 'https://youtube.com/@theigu',

  // Fonts
  fontStack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
} as const;

// ── Layout Wrapper ───────────────────────────────────────────────────────────

interface LayoutOptions {
  content: string;
  preheader?: string;
  theme?: 'light' | 'dark';
  showSocial?: boolean;
  showUnsubscribe?: boolean;
}

/**
 * Wraps email content in the branded IGU layout.
 *
 * Features:
 * - Header with IGU logo + red accent line
 * - White card body on light gray background
 * - Footer with social links, copyright, support email
 * - Optional preheader text (inbox preview)
 * - Optional unsubscribe link
 */
export function wrapInLayout({
  content,
  preheader,
  theme = 'light',
  showSocial = true,
  showUnsubscribe = false,
}: LayoutOptions): string {
  const bgColor = theme === 'dark' ? EMAIL_BRAND.dark : EMAIL_BRAND.gray100;
  const cardBg = theme === 'dark' ? '#18181B' : '#ffffff';
  const textColor = theme === 'dark' ? EMAIL_BRAND.gray200 : EMAIL_BRAND.body;

  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;color:${bgColor};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>`
    : '';

  const socialHtml = showSocial
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
        <tr>
          <td align="center" style="padding: 0;">
            <a href="${EMAIL_BRAND.instagramUrl}" style="color: ${EMAIL_BRAND.muted}; text-decoration: none; font-size: 13px; padding: 0 8px;">Instagram</a>
            <span style="color: ${EMAIL_BRAND.light};">|</span>
            <a href="${EMAIL_BRAND.tiktokUrl}" style="color: ${EMAIL_BRAND.muted}; text-decoration: none; font-size: 13px; padding: 0 8px;">TikTok</a>
            <span style="color: ${EMAIL_BRAND.light};">|</span>
            <a href="${EMAIL_BRAND.youtubeUrl}" style="color: ${EMAIL_BRAND.muted}; text-decoration: none; font-size: 13px; padding: 0 8px;">YouTube</a>
          </td>
        </tr>
      </table>`
    : '';

  const unsubscribeHtml = showUnsubscribe
    ? `<p style="color: ${EMAIL_BRAND.light}; font-size: 12px; margin: 8px 0 0 0;">
        <a href="${APP_BASE_URL}/unsubscribe" style="color: ${EMAIL_BRAND.light}; text-decoration: underline;">Unsubscribe</a> from these emails
      </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>IGU</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${bgColor}; font-family: ${EMAIL_BRAND.fontStack}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  ${preheaderHtml}

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${bgColor};">
    <tr>
      <td align="center" style="padding: 24px 16px;">

        <!-- Email container (600px max) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding: 0 0 4px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 16px 0;">
                    <a href="${APP_BASE_URL}" style="text-decoration: none;">
                      <img src="${EMAIL_BRAND.logoUrl}" alt="IGU" width="48" height="48" style="display: block; border: 0; border-radius: 8px;" />
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Red accent line -->
          <tr>
            <td style="padding: 0;">
              <div style="height: 3px; background-color: ${EMAIL_BRAND.red}; border-radius: 3px 3px 0 0;"></div>
            </td>
          </tr>

          <!-- Body card -->
          <tr>
            <td style="background-color: ${cardBg}; padding: 36px 32px; border-radius: 0 0 8px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color: ${textColor}; font-family: ${EMAIL_BRAND.fontStack}; font-size: 16px; line-height: 1.6;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 24px 16px 0 16px;">
              ${socialHtml}
              <p style="color: ${EMAIL_BRAND.light}; font-size: 12px; margin: 12px 0 0 0;">
                &copy; ${new Date().getFullYear()} IGU. All rights reserved.
              </p>
              <p style="color: ${EMAIL_BRAND.light}; font-size: 12px; margin: 4px 0 0 0;">
                Questions? <a href="mailto:${EMAIL_BRAND.supportEmail}" style="color: ${EMAIL_BRAND.muted}; text-decoration: underline;">${EMAIL_BRAND.supportEmail}</a>
              </p>
              ${unsubscribeHtml}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
