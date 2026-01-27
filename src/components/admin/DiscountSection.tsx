import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DiscountCodeManager } from "@/components/DiscountCodeManager";
import { DiscountAnalytics } from "@/components/admin/DiscountAnalytics";
import { Tag, BarChart3 } from "lucide-react";

export function DiscountSection() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="analytics" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Manage Codes
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="analytics" className="mt-6">
          <DiscountAnalytics />
        </TabsContent>
        
        <TabsContent value="manage" className="mt-6">
          <DiscountCodeManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
