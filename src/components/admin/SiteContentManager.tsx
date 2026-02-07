import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useAllSiteContent,
  getUniquePages,
  getSectionsForPage,
  getItemsForSection,
} from "@/hooks/useSiteContent";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, ExternalLink, RefreshCw, Plus, Trash2 } from "lucide-react";

interface SiteContentRow {
  id: string;
  page: string;
  section: string;
  key: string;
  value: string;
  value_type: string;
  sort_order: number;
  is_active: boolean;
}

// Page path mapping for "View Live" links
const PAGE_PATHS: Record<string, string> = {
  homepage: "/",
  services: "/services",
  "meet-our-team": "/meet-our-team",
  "calorie-calculator": "/calorie-calculator",
};

export function SiteContentManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: allContent, isLoading, error, refetch } = useAllSiteContent();

  const [activePage, setActivePage] = useState("homepage");
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Get unique pages from content
  const pages = allContent ? getUniquePages(allContent) : [];

  // Reset edited values when switching pages
  useEffect(() => {
    setEditedValues({});
  }, [activePage]);

  // Mutation for saving content
  const saveMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase
        .from("site_content")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      return { id, value };
    },
    onSuccess: (data) => {
      // Update local state
      setEditedValues((prev) => {
        const next = { ...prev };
        delete next[data.id];
        return next;
      });
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(data.id);
        return next;
      });

      // Invalidate queries to refresh
      queryClient.invalidateQueries({ queryKey: ["site-content"] });

      toast({
        title: "Saved",
        description: "Content updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
      setSavingIds(new Set());
    },
  });

  const handleValueChange = (id: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleSave = async (item: SiteContentRow) => {
    const newValue = editedValues[item.id];
    if (newValue === undefined || newValue === item.value) return;

    setSavingIds((prev) => new Set([...prev, item.id]));
    saveMutation.mutate({ id: item.id, value: newValue });
  };

  const isEdited = (item: SiteContentRow) => {
    return editedValues[item.id] !== undefined && editedValues[item.id] !== item.value;
  };

  const getDisplayValue = (item: SiteContentRow) => {
    return editedValues[item.id] !== undefined ? editedValues[item.id] : item.value;
  };

  // Parse JSON fields for list editing
  const parseJsonArray = (value: string): string[] => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const stringifyJsonArray = (items: string[]): string => {
    return JSON.stringify(items);
  };

  const handleJsonArrayChange = (item: SiteContentRow, index: number, newValue: string) => {
    const currentValue = getDisplayValue(item);
    const items = parseJsonArray(currentValue);
    items[index] = newValue;
    handleValueChange(item.id, stringifyJsonArray(items));
  };

  const handleJsonArrayAdd = (item: SiteContentRow) => {
    const currentValue = getDisplayValue(item);
    const items = parseJsonArray(currentValue);
    items.push("");
    handleValueChange(item.id, stringifyJsonArray(items));
  };

  const handleJsonArrayRemove = (item: SiteContentRow, index: number) => {
    const currentValue = getDisplayValue(item);
    const items = parseJsonArray(currentValue);
    items.splice(index, 1);
    handleValueChange(item.id, stringifyJsonArray(items));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 text-center">
          <p className="text-destructive mb-4">Error loading site content</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!allContent || allContent.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>No site content found. Run the seed migration to populate content.</p>
        </CardContent>
      </Card>
    );
  }

  const sections = getSectionsForPage(allContent, activePage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Site Content Editor</h2>
          <p className="text-sm text-muted-foreground">
            Edit website copywriting and content
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {PAGE_PATHS[activePage] && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(PAGE_PATHS[activePage], "_blank")}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Live
            </Button>
          )}
        </div>
      </div>

      {/* Page Tabs */}
      <Tabs value={activePage} onValueChange={setActivePage}>
        <TabsList className="mb-4">
          {pages.map((page) => (
            <TabsTrigger key={page} value={page} className="capitalize">
              {page.replace(/-/g, " ")}
            </TabsTrigger>
          ))}
        </TabsList>

        {pages.map((page) => (
          <TabsContent key={page} value={page}>
            {/* Section Accordions */}
            <Accordion type="multiple" defaultValue={sections} className="space-y-4">
              {sections.map((section) => {
                const items = getItemsForSection(allContent, page, section);
                const hasUnsaved = items.some((item) => isEdited(item));

                return (
                  <AccordionItem
                    key={section}
                    value={section}
                    className="border rounded-lg bg-card"
                  >
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <span className="font-medium capitalize">
                          {section.replace(/_/g, " ")}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {items.length} {items.length === 1 ? "field" : "fields"}
                        </Badge>
                        {hasUnsaved && (
                          <Badge variant="default" className="text-xs">
                            Unsaved changes
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4">
                        {items.map((item) => (
                          <FieldEditor
                            key={item.id}
                            item={item}
                            value={getDisplayValue(item)}
                            isEdited={isEdited(item)}
                            isSaving={savingIds.has(item.id)}
                            onChange={(value) => handleValueChange(item.id, value)}
                            onSave={() => handleSave(item)}
                            onJsonArrayChange={(index, value) =>
                              handleJsonArrayChange(item, index, value)
                            }
                            onJsonArrayAdd={() => handleJsonArrayAdd(item)}
                            onJsonArrayRemove={(index) =>
                              handleJsonArrayRemove(item, index)
                            }
                            parseJsonArray={parseJsonArray}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface FieldEditorProps {
  item: SiteContentRow;
  value: string;
  isEdited: boolean;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onJsonArrayChange: (index: number, value: string) => void;
  onJsonArrayAdd: () => void;
  onJsonArrayRemove: (index: number) => void;
  parseJsonArray: (value: string) => string[];
}

function FieldEditor({
  item,
  value,
  isEdited,
  isSaving,
  onChange,
  onSave,
  onJsonArrayChange,
  onJsonArrayAdd,
  onJsonArrayRemove,
  parseJsonArray,
}: FieldEditorProps) {
  const isLongText = value.length > 100 || item.value_type === "richtext";
  const isJson = item.value_type === "json";
  const isNumber = item.value_type === "number";

  // Format key for display
  const displayKey = item.key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="border rounded-lg p-4 bg-background">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <label className="font-medium text-sm">{displayKey}</label>
            <Badge variant="outline" className="text-xs">
              {item.value_type}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Key: {item.key}
          </p>
        </div>
        <Button
          size="sm"
          variant={isEdited ? "default" : "outline"}
          disabled={!isEdited || isSaving}
          onClick={onSave}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4 mr-1" />
              Save
            </>
          )}
        </Button>
      </div>

      {isJson ? (
        // JSON array editor
        <div className="space-y-2">
          {parseJsonArray(value).map((arrayItem, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={arrayItem}
                onChange={(e) => onJsonArrayChange(index, e.target.value)}
                placeholder={`Item ${index + 1}`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onJsonArrayRemove(index)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={onJsonArrayAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>
      ) : isLongText ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="resize-y"
        />
      ) : isNumber ? (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[200px] font-mono"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
