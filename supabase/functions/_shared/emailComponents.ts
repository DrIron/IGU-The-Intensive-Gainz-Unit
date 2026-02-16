/**
 * Reusable HTML email components for IGU.
 *
 * All styles are inline. Never use <style> blocks or display:flex.
 * Components return raw HTML strings to be composed inside wrapInLayout().
 */

import { EMAIL_BRAND } from './emailTemplate.ts';

// ── CTA Button ───────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const buttonColors: Record<ButtonVariant, { bg: string; shadow: string }> = {
  primary: { bg: EMAIL_BRAND.red, shadow: 'rgba(217,20,73,0.3)' },
  secondary: { bg: EMAIL_BRAND.gray600, shadow: 'rgba(82,82,91,0.2)' },
  danger: { bg: EMAIL_BRAND.error, shadow: 'rgba(220,38,38,0.3)' },
};

export function ctaButton(text: string, href: string, variant: ButtonVariant = 'primary'): string {
  const { bg, shadow } = buttonColors[variant];
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding: 24px 0;">
          <a href="${href}"
             style="display: inline-block; background-color: ${bg}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px ${shadow}; min-width: 44px; min-height: 44px; line-height: 1.2;"
          >${text}</a>
        </td>
      </tr>
    </table>`;
}

// ── Alert Box ────────────────────────────────────────────────────────────────

type AlertType = 'info' | 'warning' | 'error' | 'success';

const alertStyles: Record<AlertType, { bg: string; border: string; text: string }> = {
  info: { bg: EMAIL_BRAND.infoBg, border: EMAIL_BRAND.info, text: '#1e40af' },
  warning: { bg: EMAIL_BRAND.warningBg, border: EMAIL_BRAND.warning, text: '#92400e' },
  error: { bg: EMAIL_BRAND.errorBg, border: EMAIL_BRAND.error, text: '#991b1b' },
  success: { bg: EMAIL_BRAND.successBg, border: EMAIL_BRAND.success, text: '#166534' },
};

export function alertBox(content: string, type: AlertType = 'info'): string {
  const s = alertStyles[type];
  return `
    <div style="background-color: ${s.bg}; border-left: 4px solid ${s.border}; padding: 16px; margin: 20px 0; border-radius: 0 4px 4px 0;">
      <p style="color: ${s.text}; font-size: 14px; line-height: 1.6; margin: 0;">${content}</p>
    </div>`;
}

// ── Detail Card ──────────────────────────────────────────────────────────────

interface DetailItem {
  label: string;
  value: string;
}

export function detailCard(title: string, items: DetailItem[]): string {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="color: ${EMAIL_BRAND.muted}; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top; white-space: nowrap;">${item.label}</td>
          <td style="color: ${EMAIL_BRAND.heading}; font-size: 14px; padding: 6px 0; font-weight: 600;">${item.value}</td>
        </tr>`
    )
    .join('');

  return `
    <div style="background-color: ${EMAIL_BRAND.gray100}; border-left: 4px solid ${EMAIL_BRAND.red}; border-radius: 0 8px 8px 0; padding: 20px; margin: 20px 0;">
      <p style="color: ${EMAIL_BRAND.heading}; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">${title}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${rows}
      </table>
    </div>`;
}

// ── Stat Card ────────────────────────────────────────────────────────────────

export function statCard(label: string, value: string | number, highlight = false): string {
  const bg = highlight ? EMAIL_BRAND.errorBg : EMAIL_BRAND.gray100;
  const valueColor = highlight ? EMAIL_BRAND.error : EMAIL_BRAND.heading;
  return `
    <div style="background-color: ${bg}; border-radius: 8px; padding: 16px; text-align: center;">
      <p style="color: ${EMAIL_BRAND.muted}; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">${label}</p>
      <p style="color: ${valueColor}; font-size: 24px; font-weight: bold; margin: 0;">${value}</p>
    </div>`;
}

/**
 * 2-column stat grid using tables (Outlook-safe, no display:flex).
 * Pass an even number of statCard() HTML strings.
 */
export function statGrid(cards: string[]): string {
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    const left = cards[i] || '';
    const right = cards[i + 1] || '';
    rows.push(`
      <tr>
        <td width="50%" style="padding: 6px;">${left}</td>
        <td width="50%" style="padding: 6px;">${right}</td>
      </tr>`);
  }
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
      ${rows.join('')}
    </table>`;
}

// ── Section Heading ──────────────────────────────────────────────────────────

export function sectionHeading(text: string): string {
  return `
    <h2 style="color: ${EMAIL_BRAND.heading}; font-size: 18px; margin: 28px 0 4px 0; padding-bottom: 8px; border-bottom: 2px solid ${EMAIL_BRAND.red};">${text}</h2>`;
}

// ── Greeting ─────────────────────────────────────────────────────────────────

export function greeting(name: string): string {
  return `<p style="color: ${EMAIL_BRAND.body}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hi ${name},</p>`;
}

// ── Sign Off ─────────────────────────────────────────────────────────────────

export function signOff(): string {
  return `
    <p style="color: ${EMAIL_BRAND.body}; font-size: 16px; line-height: 1.6; margin: 28px 0 0 0;">
      Best regards,<br>
      <strong style="color: ${EMAIL_BRAND.heading};">The IGU Team</strong>
    </p>`;
}

// ── Paragraph ────────────────────────────────────────────────────────────────

export function paragraph(text: string): string {
  return `<p style="color: ${EMAIL_BRAND.body}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${text}</p>`;
}

// ── Banner ───────────────────────────────────────────────────────────────────

export function banner(title: string, subtitle?: string): string {
  return `
    <div style="background-color: ${EMAIL_BRAND.red}; border-radius: 8px; padding: 24px; margin: 0 0 24px 0; text-align: center;">
      <p style="color: #ffffff; font-size: 20px; font-weight: bold; margin: 0 0 ${subtitle ? '8px' : '0'} 0;">${title}</p>
      ${subtitle ? `<p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0;">${subtitle}</p>` : ''}
    </div>`;
}

// ── Ordered List ─────────────────────────────────────────────────────────────

export function orderedList(items: string[]): string {
  const lis = items.map((item) => `<li style="margin-bottom: 8px;">${item}</li>`).join('');
  return `<ol style="color: ${EMAIL_BRAND.body}; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; padding-left: 20px;">${lis}</ol>`;
}

// ── Divider ──────────────────────────────────────────────────────────────────

export function divider(): string {
  return `<hr style="border: none; border-top: 1px solid ${EMAIL_BRAND.gray200}; margin: 24px 0;">`;
}
