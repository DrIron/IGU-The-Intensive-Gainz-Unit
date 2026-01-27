import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export const AirtableTestButton = () => {
  const [loading, setLoading] = useState(false);

  const createTestClient = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-airtable-client', {
        body: {
          email: 'hasandashti.hd@gmail.com',
          fullName: 'Hasan Dashti (Test)',
          planType: 'Standard Plan'
        }
      });

      if (error) throw error;

      console.log('=== AIRTABLE SCHEMA ===');
      console.log(JSON.stringify(data.schema, null, 2));
      console.log('=== SAMPLE RECORDS ===');
      console.log(JSON.stringify(data.sampleRecords, null, 2));
      
      toast.success('Airtable data fetched! Check console for details.');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to create test client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={createTestClient} disabled={loading}>
      {loading ? 'Creating...' : 'Create Test Client in Airtable'}
    </Button>
  );
};
