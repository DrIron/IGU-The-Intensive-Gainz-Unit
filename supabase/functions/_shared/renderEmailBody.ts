/**
 * Renders body_sections JSONB into HTML using emailComponents functions.
 * Used by drip edge functions when admin has customized email content.
 */
import {
  greeting,
  paragraph,
  ctaButton,
  alertBox,
  detailCard,
  statCard,
  sectionHeading,
  banner,
  orderedList,
  divider,
  signOff,
} from './emailComponents.ts';

type ComponentRenderer = (...args: string[]) => string;

const COMPONENT_MAP: Record<string, ComponentRenderer> = {
  greeting: (name: string) => greeting(name),
  paragraph: (text: string) => paragraph(text),
  ctaButton: (text: string, href: string, variant?: string) =>
    ctaButton(text, href, (variant as 'primary' | 'secondary' | 'danger') || 'primary'),
  alertBox: (content: string, type?: string) =>
    alertBox(content, (type as 'info' | 'warning' | 'error' | 'success') || 'info'),
  sectionHeading: (text: string) => sectionHeading(text),
  banner: (title: string, subtitle?: string) => banner(title, subtitle),
  divider: () => divider(),
  signOff: () => signOff(),
  orderedList: (...items: string[]) => orderedList(items),
};

/**
 * Replace {{var}} placeholders in a string.
 */
export function resolveVars(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

/**
 * Render an array of body sections into HTML.
 * Each section: { type: string, args: string[] }
 *
 * Unknown component types are rendered as paragraphs with a warning.
 */
export function renderBodySections(
  sections: Array<{ type: string; args?: string[] }>,
  vars: Record<string, string>
): string {
  return sections
    .map((section) => {
      const renderer = COMPONENT_MAP[section.type];
      const resolvedArgs = (section.args || []).map((arg) =>
        resolveVars(arg, vars)
      );

      if (renderer) {
        return renderer(...resolvedArgs);
      }

      // Unknown component -- render as paragraph with the first arg
      console.warn(`renderBodySections: unknown component type "${section.type}"`);
      return resolvedArgs[0] ? paragraph(resolvedArgs[0]) : '';
    })
    .join('');
}
