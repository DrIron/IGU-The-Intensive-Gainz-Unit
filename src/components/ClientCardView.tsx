import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Phone, Calendar, DollarSign, Users } from "lucide-react";
import { formatProfileStatus, getProfileStatusVariant } from "@/lib/statusUtils";
import { EmptyState } from "@/components/ui/empty-state";

interface Client {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string | null;
  created_at: string;
  subscriptions: Array<{
    id: string;
    status: string;
    services: {
      name: string;
      price_kwd: number;
    };
  }>;
}

// NOTE: This component is ADMIN-ONLY. Coach approval is handled in CoachMyClientsPage.
interface ClientCardViewProps {
  clients: Client[];
  onViewDetails?: (clientId: string) => void;
  onAction?: (clientId: string, action: string) => void;
}

export function ClientCardView({ 
  clients, 
  onViewDetails, 
  onAction,
}: ClientCardViewProps) {

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {clients.length === 0 ? (
        <div className="col-span-full">
          <EmptyState
            icon={Users}
            title="No clients found"
            description="No clients match the current filters."
          />
        </div>
      ) : (
        clients.map((client) => {
          const activeSubscription = client.subscriptions?.find(sub => sub.status === "active");
          const pendingSubscription = client.subscriptions?.find(sub => sub.status === "pending");
          const displaySubscription = activeSubscription || pendingSubscription;
          
          return (
            <Card key={client.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{client.full_name || "-"}</h3>
                    <Badge variant={getProfileStatusVariant(client.status)} className="text-xs mt-1">
                      {formatProfileStatus(client.status)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                  
                  {client.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4 flex-shrink-0" />
                      <span>{client.phone}</span>
                    </div>
                  )}

                  {displaySubscription && (
                    <>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <DollarSign className="h-4 w-4 flex-shrink-0" />
                        <span>
                          {displaySubscription.services.name} - {displaySubscription.services.price_kwd} KWD
                        </span>
                      </div>
                    </>
                  )}

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>Joined {new Date(client.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* View Details button - Admin action */}
                {onViewDetails && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => onViewDetails(client.id)}
                  >
                    View Details
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
