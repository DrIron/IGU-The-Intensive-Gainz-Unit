import { Helmet } from "react-helmet-async";
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
const DEFAULT_IMAGE = "https://theigu.com/og-image.jpg";
const SITE_NAME = "Intensive Gainz Unit";

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

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{finalTitle}</title>
      <meta name="title" content={finalTitle} />
      <meta name="description" content={finalDescription} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={finalUrl} />
      <meta property="og:title" content={finalTitle} />
      <meta property="og:description" content={finalDescription} />
      <meta property="og:image" content={finalImage} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={finalUrl} />
      <meta property="twitter:title" content={finalTitle} />
      <meta property="twitter:description" content={finalDescription} />
      <meta property="twitter:image" content={finalImage} />
    </Helmet>
  );
}
