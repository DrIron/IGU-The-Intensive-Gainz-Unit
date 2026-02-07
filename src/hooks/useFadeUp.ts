import { useEffect, useRef, useState } from "react";

interface UseFadeUpOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Hook for scroll-triggered fade-up animations using IntersectionObserver
 * Returns a ref to attach to the element and visibility state
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { ref, isVisible } = useFadeUp();
 *   return (
 *     <div ref={ref} className={`fade-up ${isVisible ? 'visible' : ''}`}>
 *       Content
 *     </div>
 *   );
 * }
 * ```
 */
export function useFadeUp<T extends HTMLElement = HTMLDivElement>(
  options: UseFadeUpOptions = {}
) {
  const { threshold = 0.1, rootMargin = "0px", triggerOnce = true } = options;

  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce]);

  return { ref, isVisible };
}

/**
 * Hook to create multiple fade-up refs for a list of elements
 * Useful for staggered animations
 */
export function useFadeUpList(count: number, options: UseFadeUpOptions = {}) {
  const { threshold = 0.1, rootMargin = "0px", triggerOnce = true } = options;

  const refs = useRef<(HTMLElement | null)[]>([]);
  const [visibleItems, setVisibleItems] = useState<boolean[]>(
    Array(count).fill(false)
  );

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    refs.current.forEach((element, index) => {
      if (!element) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisibleItems((prev) => {
              const next = [...prev];
              next[index] = true;
              return next;
            });
            if (triggerOnce) {
              observer.unobserve(element);
            }
          } else if (!triggerOnce) {
            setVisibleItems((prev) => {
              const next = [...prev];
              next[index] = false;
              return next;
            });
          }
        },
        {
          threshold,
          rootMargin,
        }
      );

      observer.observe(element);
      observers.push(observer);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [count, threshold, rootMargin, triggerOnce]);

  const setRef = (index: number) => (element: HTMLElement | null) => {
    refs.current[index] = element;
  };

  return { setRef, visibleItems };
}
