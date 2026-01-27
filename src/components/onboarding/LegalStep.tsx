import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ExternalLink, CheckCircle2, Circle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface LegalStepProps {
  form: UseFormReturn<any>;
}

interface LegalDocument {
  document_type: string;
  document_url: string;
}

export function LegalStep({ form }: LegalStepProps) {
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadCustomDocuments();
  }, []);

  const handleViewDocument = async (url: string) => {
    // Check if user is authenticated before opening document
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to view legal documents.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }
    window.open(url, '_blank');
  };

  const loadCustomDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('legal_documents')
        .select('document_type, document_url');

      if (error) throw error;

      const urlMap: Record<string, string> = {};
      data?.forEach((doc: LegalDocument) => {
        urlMap[doc.document_type] = doc.document_url;
      });
      setDocumentUrls(urlMap);
    } catch (error) {
      console.error('Error loading custom documents:', error);
    }
  };

  // Note: liability-release.pdf must be uploaded via Admin > Discord & Legal
  // as there is no default static file for it in public/legal/
  const legalDocuments = [
    {
      name: "agreed_terms",
      label: "Terms and Conditions",
      pdfUrl: documentUrls.terms_conditions || "/legal/terms-and-conditions.pdf",
    },
    {
      name: "agreed_privacy",
      label: "Privacy Policy",
      pdfUrl: documentUrls.privacy_policy || "/legal/privacy-policy.pdf",
    },
    {
      name: "agreed_refund_policy",
      label: "Refund & Cancellation Policy",
      pdfUrl: documentUrls.refund_policy || "/legal/refund-cancellation-policy.pdf",
    },
    {
      name: "agreed_intellectual_property",
      label: "Intellectual Property Protection Statement",
      pdfUrl: documentUrls.intellectual_property || "/legal/intellectual-property.pdf",
    },
    {
      name: "agreed_medical_disclaimer",
      label: "Release of Liability and Assumption of Risk",
      pdfUrl: documentUrls.liability_release,
      required: true,
    },
  ];

  // Count accepted documents
  const acceptedCount = legalDocuments.filter(doc => {
    const value = form.watch(doc.name as any);
    return value === true;
  }).length;
  
  const allLegalAccepted = acceptedCount === legalDocuments.length;
  const progressPercent = (acceptedCount / legalDocuments.length) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Legal Agreements</h2>
        <p className="text-muted-foreground">
          Review and accept the following documents to complete your registration.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {acceptedCount} of {legalDocuments.length} documents accepted
          </span>
          {allLegalAccepted && (
            <span className="flex items-center gap-1 text-green-600 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Ready to submit
            </span>
          )}
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      <div className="space-y-3">
        {legalDocuments.map((doc) => {
          const hasDocument = !!doc.pdfUrl;
          const isChecked = !!form.watch(doc.name as any);
          
          return (
            <FormField
              key={doc.name}
              control={form.control}
              name={doc.name}
              render={({ field }) => (
                <FormItem 
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-4 transition-all",
                    isChecked 
                      ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <FormControl>
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                        disabled={!hasDocument}
                        className={cn(
                          "h-5 w-5",
                          isChecked && "border-green-600 bg-green-600 data-[state=checked]:bg-green-600"
                        )}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className={cn(
                        "text-sm font-medium cursor-pointer",
                        isChecked && "text-green-700 dark:text-green-400"
                      )}>
                        {doc.label}
                      </FormLabel>
                      {!hasDocument && (
                        <p className="text-xs text-amber-600">
                          Document pending upload. Contact support.
                        </p>
                      )}
                    </div>
                  </div>
                  {hasDocument ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-primary hover:text-primary"
                      onClick={() => handleViewDocument(doc.pdfUrl!)}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled
                      className="shrink-0 opacity-50"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Unavailable
                    </Button>
                  )}
                </FormItem>
              )}
            />
          );
        })}
      </div>

      {/* Gentle completion helper - not error-like */}
      {!allLegalAccepted && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
          <Circle className="h-4 w-4 shrink-0" />
          <span>
            Please review and accept all {legalDocuments.length - acceptedCount} remaining document{legalDocuments.length - acceptedCount !== 1 ? 's' : ''} to continue.
          </span>
        </div>
      )}

      {allLegalAccepted && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            All agreements accepted. You're ready to submit your application!
          </span>
        </div>
      )}
    </div>
  );
}
