import { useEffect } from "react";
import { useSiteContent } from "@/hooks/useSiteContent";

interface SEOHeadProps {
  /** The page name to fetch CMS meta content for */
  page?: string;
  /** Override title (uses CMS if not provided) */
  title?: string;
  /** Override description (uses CMS if not provided) */
  description?: string;
  /** Override image URL for og:image */
  image?: string;
  /** Override URL for og:url */
  url?: string;
  /** Page type for og:type (default: website) */
  type?: string;
}

const DEFAULT_TITLE = "Intensive Gainz Unit | Professional Fitness Coaching";
const DEFAULT_DESCRIPTION = "Evidence-based online coaching, team programs, and performance tracking for serious lifters. Transform your training with IGU.";
const DEFAULT_IMAGE = "https://theigu.com/og-image.png";
const SITE_NAME = "Intensive Gainz Unit";

/**
 * Per-page document metadata via React 19 native hoisting — the `<meta>` tags
 * below are hoisted into `<head>` by React regardless of tree position, and
 * removed on unmount, so each page owns exactly one set. We deliberately do NOT
 * use react-helmet-async: it is unmaintained and its client dispatcher is inert
 * under React 19 (silent no-commit) — the cause of the /coaches/:slug SEO
 * regression. index.html carries NO overridable title/og/twitter tags, only a
 * minimal static `<title>` fallback (see index.html).
 *
 * `<title>` is set imperatively (not rendered) so it overwrites that static
 * fallback element in place — rendering a `<title>` would append a second one
 * and the browser would keep using the first (static) one.
 */
export function SEOHead({
  page = "homepage",
  title,
  description,
  image,
  url,
  type = "website",
}: SEOHeadProps) {
  const { data: cmsContent } = useSiteContent(page);

  // Use props first, then CMS content, then defaults
  const finalTitle = title || cmsContent?.meta?.title || DEFAULT_TITLE;
  const finalDescription = description || cmsContent?.meta?.description || DEFAULT_DESCRIPTION;
  const finalImage = image || cmsContent?.meta?.og_image || DEFAULT_IMAGE;
  const finalUrl = url || (typeof window !== "undefined" ? window.location.href : "https://theigu.com");

  useEffect(() => {
    document.title = finalTitle;
  }, [finalTitle]);

  return (
    <>
      {/* Primary Meta Tags */}
      <meta name="title" content={finalTitle} />
      <meta name="description" content={finalDescription} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={finalUrl} />
      <meta property="og:title" content={finalTitle} />
      <meta property="og:description" content={finalDescription} />
      <meta property="og:image" content={finalImage} />
      <meta property="og:image:width" content="2400" />
      <meta property="og:image:height" content="1260" />
      <meta property="og:image:alt" content={finalTitle} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={finalUrl} />
      <meta property="twitter:title" content={finalTitle} />
      <meta property="twitter:description" content={finalDescription} />
      <meta property="twitter:image" content={finalImage} />
    </>
  );
}
