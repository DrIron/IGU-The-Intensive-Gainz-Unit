import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { TestimonialsList } from "@/components/marketing/TestimonialsList";
import { useCanLeaveTestimonial } from "@/hooks/useCanLeaveTestimonial";

/**
 * Public, view-only testimonials page (plural /testimonials). Approved rows are anon-readable,
 * so no AuthGuard. The client SUBMIT form lives at the singular /testimonial (client-gated) — the
 * "Leave a testimonial" CTA below shows ONLY to eligible clients.
 */
const Testimonials = () => {
  const { canLeave } = useCanLeaveTestimonial();

  return (
    <div className="min-h-screen bg-background pt-24 pb-16 px-4">
      <SEOHead
        title="Client Testimonials | Intensive Gainz Unit"
        description="Real results from real IGU clients — read what people say about coaching with the Intensive Gainz Unit."
      />
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl tracking-tight mb-4">
            What Our Clients Say
          </h1>
          <p className="text-xl text-muted-foreground">Real results from real people</p>
          {canLeave && (
            <div className="mt-6">
              <Button asChild>
                <Link to="/testimonial">Leave a testimonial</Link>
              </Button>
            </div>
          )}
        </div>

        <TestimonialsList />
      </div>
    </div>
  );
};

export default Testimonials;
