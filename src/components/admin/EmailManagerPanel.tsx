import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, ScrollText } from "lucide-react";
import { EmailCatalogTab } from "./EmailCatalogTab";
import { EmailLogTab } from "./EmailLogTab";

export function EmailManagerPanel() {
  const [activeTab, setActiveTab] = useState("catalog");
  const [logTypeFilter, setLogTypeFilter] = useState<string | undefined>();

  const handleViewLogs = (typeId: string) => {
    setLogTypeFilter(typeId);
    setActiveTab("log");
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="catalog">
          <BookOpen className="h-4 w-4 mr-1.5" />
          Catalog
        </TabsTrigger>
        <TabsTrigger value="log">
          <ScrollText className="h-4 w-4 mr-1.5" />
          Email Log
        </TabsTrigger>
      </TabsList>

      <TabsContent value="catalog">
        <EmailCatalogTab onViewLogs={handleViewLogs} />
      </TabsContent>

      <TabsContent value="log">
        <EmailLogTab defaultTypeFilter={logTypeFilter} />
      </TabsContent>
    </Tabs>
  );
}
