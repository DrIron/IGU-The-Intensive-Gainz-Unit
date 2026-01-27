import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

interface ClientDetail {
  id: string;
  name: string;
  value: number;
  status?: string;
}

interface ChartDrillDownProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  month: string;
  clients: ClientDetail[];
  valueLabel: string;
}

export function ChartDrillDown({ isOpen, onClose, title, month, clients, valueLabel }: ChartDrillDownProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Detailed breakdown for {month}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3">
          {clients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No client data available for this period
            </div>
          ) : (
            clients.map((client) => (
              <Card key={client.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{client.name}</p>
                        {client.status && (
                          <Badge variant="secondary" className="text-xs mt-1">
                            {client.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{client.value.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{valueLabel}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
