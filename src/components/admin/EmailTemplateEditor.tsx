import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface BodySection {
  type: string;
  args: string[];
}

interface EmailType {
  id: string;
  label: string;
  subject_template: string | null;
  body_sections: BodySection[] | null;
}

interface EmailTemplateEditorProps {
  emailType: EmailType;
  open: boolean;
  onClose: () => void;
  onSaved: (typeId: string, subject: string | null, bodySections: BodySection[] | null) => void;
}

const COMPONENT_TYPES = [
  { value: "greeting", label: "Greeting", argLabels: ["Name (use {{firstName}})"], defaultArgs: ["{{firstName}}"] },
  { value: "paragraph", label: "Paragraph", argLabels: ["Text"], defaultArgs: [""] },
  { value: "ctaButton", label: "CTA Button", argLabels: ["Button text", "URL"], defaultArgs: ["Click Here", "{{servicesUrl}}"] },
  { value: "alertBox", label: "Alert Box", argLabels: ["Content", "Type (info/warning/error/success)"], defaultArgs: ["", "info"] },
  { value: "sectionHeading", label: "Section Heading", argLabels: ["Heading text"], defaultArgs: [""] },
  { value: "banner", label: "Banner", argLabels: ["Title", "Subtitle (optional)"], defaultArgs: ["", ""] },
  { value: "divider", label: "Divider", argLabels: [], defaultArgs: [] },
  { value: "signOff", label: "Sign Off", argLabels: [], defaultArgs: [] },
] as const;

const COMPONENT_LABEL_MAP = Object.fromEntries(
  COMPONENT_TYPES.map((c) => [c.value, c.label])
);

const PLACEHOLDER_HELP = "Available: {{firstName}}, {{servicesUrl}}, {{teamUrl}}, {{signupUrl}}, {{resumeUrl}}, {{serviceName}}, {{currentStepName}}";

export function EmailTemplateEditor({
  emailType,
  open,
  onClose,
  onSaved,
}: EmailTemplateEditorProps) {
  const [subject, setSubject] = useState(emailType.subject_template || "");
  const [sections, setSections] = useState<BodySection[]>(
    emailType.body_sections || []
  );
  const [saving, setSaving] = useState(false);

  const addSection = (type: string) => {
    const componentDef = COMPONENT_TYPES.find((c) => c.value === type);
    const defaultArgs = componentDef ? [...componentDef.defaultArgs] : [""];
    setSections([...sections, { type, args: defaultArgs }]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    const newSections = [...sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;
    [newSections[index], newSections[targetIndex]] = [
      newSections[targetIndex],
      newSections[index],
    ];
    setSections(newSections);
  };

  const updateArg = (sectionIndex: number, argIndex: number, value: string) => {
    const newSections = [...sections];
    newSections[sectionIndex] = {
      ...newSections[sectionIndex],
      args: newSections[sectionIndex].args.map((a, i) =>
        i === argIndex ? value : a
      ),
    };
    setSections(newSections);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const subjectToSave = subject.trim() || null;
      const sectionsToSave = sections.length > 0 ? sections : null;

      const { error } = await supabase
        .from("email_types")
        .update({
          subject_template: subjectToSave,
          body_sections: sectionsToSave as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", emailType.id);

      if (error) throw error;

      toast.success("Template saved");
      onSaved(emailType.id, subjectToSave, sectionsToSave);
    } catch (err: unknown) {
      console.error("Error saving template:", err);
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("email_types")
        .update({
          subject_template: null,
          body_sections: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", emailType.id);

      if (error) throw error;

      setSubject("");
      setSections([]);
      toast.success("Reset to default template");
      onSaved(emailType.id, null, null);
    } catch (err: unknown) {
      console.error("Error resetting template:", err);
      toast.error("Failed to reset template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Email Template</SheetTitle>
          <p className="text-sm text-muted-foreground">{emailType.label}</p>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Leave empty to use default"
            />
            <p className="text-xs text-muted-foreground">{PLACEHOLDER_HELP}</p>
          </div>

          {/* Body Sections */}
          <div className="space-y-3">
            <Label>Body Sections</Label>
            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No custom sections. Add sections below or leave empty to use defaults.
              </p>
            )}

            {sections.map((section, sIndex) => {
              const componentDef = COMPONENT_TYPES.find(
                (c) => c.value === section.type
              );
              const argLabels = componentDef?.argLabels || [];

              return (
                <Card key={sIndex}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">
                        {COMPONENT_LABEL_MAP[section.type] || section.type}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={sIndex === 0}
                          onClick={() => moveSection(sIndex, "up")}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={sIndex === sections.length - 1}
                          onClick={() => moveSection(sIndex, "down")}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeSection(sIndex)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {argLabels.map((label, aIndex) => (
                      <div key={aIndex} className="space-y-1">
                        <Label className="text-xs">{label}</Label>
                        {label.toLowerCase().includes("text") ||
                        label.toLowerCase().includes("content") ? (
                          <Textarea
                            value={section.args[aIndex] || ""}
                            onChange={(e) => updateArg(sIndex, aIndex, e.target.value)}
                            rows={2}
                            className="text-sm"
                          />
                        ) : (
                          <Input
                            value={section.args[aIndex] || ""}
                            onChange={(e) => updateArg(sIndex, aIndex, e.target.value)}
                            className="text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}

            {/* Add Section */}
            <div className="flex items-center gap-2">
              <Select onValueChange={addSection}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add section..." />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENT_TYPES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <Plus className="h-3.5 w-3.5" />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <SheetFooter className="mt-6 flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset to Default
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save Template
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
