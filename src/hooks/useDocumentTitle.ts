import { useEffect } from "react";

const DEFAULT_TITLE = "Intensive Gainz Unit Coaching";
const DEFAULT_DESCRIPTION = "Evidence-based online coaching, team programs, and performance tracking for serious lifters.";

interface SEOOptions {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
}

export function useDocumentTitle(options: SEOOptions = {}) {
  const {
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
    ogTitle,
    ogDescription,
    ogType = "website",
  } = options;

  useEffect(() => {

    // Set document title
    document.title = title;

    // Update or create meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute("content", description);

    // Update OG tags
    const updateOgTag = (property: string, content: string) => {
      let tag = document.querySelector(`meta[property="${property}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    updateOgTag("og:title", ogTitle || title);
    updateOgTag("og:description", ogDescription || description);
    updateOgTag("og:type", ogType);

    // Update Twitter tags
    const updateTwitterTag = (name: string, content: string) => {
      let tag = document.querySelector(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    updateTwitterTag("twitter:title", ogTitle || title);
    updateTwitterTag("twitter:description", ogDescription || description);

    // Cleanup - restore defaults on unmount
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description, ogTitle, ogDescription, ogType]);
}
