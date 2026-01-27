import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckSquare, Mail, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BulkClientActionsProps {
  clients: Array<{ id: string; full_name: string; email: string }>;
  onRefresh: () => void;
}

export function BulkClientActions({ clients, onRefresh }: BulkClientActionsProps) {
  const { toast } = useToast();
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const toggleClient = (clientId: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedClients(newSelected);
  };

  const toggleAll = () => {
    if (selectedClients.size === clients.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(clients.map(c => c.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedClients.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select clients to approve",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const clientIds = Array.from(selectedClients);
      
      // Approve clients through proper RLS-protected update
      // Only admins can update status to pending_payment (enforced by RLS)
      const results = await Promise.allSettled(
        clientIds.map(async (clientId) => {
          // Update profiles_public table directly (admin has RLS access)
          const { error } = await supabase
            .from('profiles_public')
            .update({ status: 'pending_payment' })
            .eq('id', clientId);
          
          if (error) throw error;
          return clientId;
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (successful > 0) {
        toast({
          title: "Success",
          description: failed > 0 
            ? `Approved ${successful} client(s), ${failed} failed` 
            : `Approved ${successful} client(s)`,
        });
      } else {
        throw new Error('All approval operations failed');
      }

      setSelectedClients(new Set());
      onRefresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkTestimonialRequest = async () => {
    if (selectedClients.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select clients to send testimonial requests",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const clientsToEmail = clients.filter(c => selectedClients.has(c.id));
      
      // Send testimonial requests in parallel
      await Promise.all(
        clientsToEmail.map(client =>
          supabase.functions.invoke('send-testimonial-request', {
            body: {
              email: client.email,
              name: client.full_name,
            },
          })
        )
      );

      toast({
        title: "Success",
        description: `Sent testimonial requests to ${clientsToEmail.length} client(s)`,
      });

      setSelectedClients(new Set());
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (clients.length === 0) return null;

  return (
    <div className="bg-muted/50 p-4 rounded-lg border border-border/50 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={selectedClients.size === clients.length && clients.length > 0}
            onCheckedChange={toggleAll}
          />
          <span className="text-sm font-medium">
            {selectedClients.size} of {clients.length} selected
          </span>
        </div>
        
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkApprove}
            disabled={loading || selectedClients.size === 0}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            Approve Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkTestimonialRequest}
            disabled={loading || selectedClients.size === 0}
          >
            <Mail className="mr-2 h-4 w-4" />
            Request Testimonials
          </Button>
        </div>
      </div>

      {/* Selection checkboxes for each client */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
        {clients.map((client) => (
          <label
            key={client.id}
            className="flex items-center gap-2 p-2 rounded hover:bg-accent/10 cursor-pointer"
          >
            <Checkbox
              checked={selectedClients.has(client.id)}
              onCheckedChange={() => toggleClient(client.id)}
            />
            <span className="text-sm truncate">{client.full_name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
