import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, ExternalLink, Loader2, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

interface LegalDocument {
  id: string;
  document_type: string;
  document_url: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface DocumentType {
  key: string;
  label: string;
  staticPath: string | null; // null means no default file exists - must be uploaded
}

const DOCUMENT_TYPES: DocumentType[] = [
  { key: 'terms_conditions', label: 'Terms and Conditions', staticPath: '/legal/terms-and-conditions.pdf' },
  { key: 'privacy_policy', label: 'Privacy Policy', staticPath: '/legal/privacy-policy.pdf' },
  { key: 'refund_policy', label: 'Refund and Cancellation Policy', staticPath: '/legal/refund-cancellation-policy.pdf' },
  { key: 'intellectual_property', label: 'Intellectual Property Protection Statement', staticPath: '/legal/intellectual-property.pdf' },
  { key: 'liability_release', label: 'Release of Liability and Assumption of Risk', staticPath: null }, // No default - must be uploaded
];

export function LegalDocumentsManager() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('legal_documents')
        .select('*')
        .order('document_type');

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error('Error loading legal documents:', error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleFileUpload = async (documentType: string, file: File) => {
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be less than 10MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingType(documentType);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Upload to Supabase Storage
      const fileName = `legal/${documentType}-${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('client-documents')
        .getPublicUrl(fileName);

      // Check if document already exists
      const existingDoc = documents.find(d => d.document_type === documentType);

      if (existingDoc) {
        // Replace existing document
        const { error: updateError } = await supabase
          .from('legal_documents')
          .update({
            document_url: publicUrl,
            uploaded_by: user.id,
          })
          .eq('document_type', documentType);

        if (updateError) throw updateError;
      } else {
        // Insert new document
        const { error: insertError } = await supabase
          .from('legal_documents')
          .insert({
            document_type: documentType,
            document_url: publicUrl,
            uploaded_by: user.id,
          });

        if (insertError) throw insertError;
      }

      toast({
        title: "Document replaced",
        description: "This document will now be shown to all new clients",
      });

      loadDocuments();
    } catch (error: any) {
      console.error('Error uploading document:', error);
      toast({
        title: "Upload failed",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setUploadingType(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Legal Documents Management</CardTitle>
            <CardDescription>
              Upload and manage legal documents that clients will see during signup
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {DOCUMENT_TYPES.map((docType) => {
            const existingDoc = documents.find(d => d.document_type === docType.key);
            const isUploading = uploadingType === docType.key;
            const hasDefaultFile = docType.staticPath !== null;
            const currentUrl = existingDoc?.document_url || docType.staticPath;
            const isCustomVersion = !!existingDoc;
            const isMissingDocument = !existingDoc && !hasDefaultFile;

            return (
              <div key={docType.key} className={cn(
                "border rounded-lg p-4 overflow-hidden",
                isMissingDocument && "border-destructive/50 bg-destructive/5"
              )}>
                <div className="flex flex-col gap-3">
                  {/* Header */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Label className="text-base font-semibold block truncate">
                        {docType.label}
                      </Label>
                      {isCustomVersion && (
                        <Badge variant="outline" className="text-xs shrink-0">Custom</Badge>
                      )}
                      {isMissingDocument && (
                        <Badge variant="destructive" className="text-xs shrink-0">Upload Required</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {isCustomVersion ? (
                        <span>
                          Last updated: {formatDistanceToNow(new Date(existingDoc.updated_at), { addSuffix: true })}
                          <span className="mx-1">•</span>
                          {new Date(existingDoc.updated_at).toLocaleDateString()}
                        </span>
                      ) : hasDefaultFile ? (
                        <span className="italic">Using default document</span>
                      ) : (
                        <span className="italic text-destructive">No document uploaded - clients cannot view this</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions - stack on mobile, row on larger screens */}
                  <div className="flex flex-wrap gap-2">
                    {currentUrl ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-w-0 sm:flex-none"
                        onClick={async () => {
                          // Admin is already authenticated to reach this page
                          window.open(currentUrl, '_blank');
                        }}
                      >
                        <ExternalLink className="h-4 w-4 shrink-0 sm:mr-2" />
                        <span className="hidden sm:inline">View</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-w-0 sm:flex-none opacity-50"
                        disabled
                      >
                        <ExternalLink className="h-4 w-4 shrink-0 sm:mr-2" />
                        <span className="hidden sm:inline">No File</span>
                      </Button>
                    )}

                    <Input
                      id={`file-${docType.key}`}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(docType.key, file);
                        e.target.value = '';
                      }}
                      disabled={isUploading}
                    />
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 min-w-0 sm:flex-none"
                      onClick={() => document.getElementById(`file-${docType.key}`)?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin sm:mr-2" />
                          <span className="hidden sm:inline">Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 shrink-0 sm:mr-2" />
                          <span className="hidden sm:inline">Replace</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 bg-muted p-4 rounded-lg">
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>View the document currently shown to clients during signup</li>
            <li>Click "Replace" to upload a new PDF that will replace the current one</li>
            <li>Custom documents override the default PDFs</li>
            <li>Maximum file size: 10MB</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}