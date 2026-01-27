import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { PersonalDetailsFields } from "@/components/forms/PersonalDetailsFields";

const manualClientSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name too long").trim(),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name too long").trim(),
  email: z.string().email("Invalid email address").max(255, "Email too long").trim().toLowerCase(),
  phoneNumber: z.string().min(8, "Phone number too short").max(15, "Phone number too long").trim(),
  countryCode: z.string().min(1, "Country code is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say'], {
    errorMap: () => ({ message: "Please select a gender" })
  }),
  serviceId: z.string().uuid("Invalid service selected").min(1, "Please select a service"),
});

type ManualClientFormData = z.infer<typeof manualClientSchema>;

interface Service {
  id: string;
  name: string;
  type: string;
  price_kwd: number;
}

interface ManualClientCreationProps {
  onClientCreated: () => void;
}

export function ManualClientCreation({ onClientCreated }: ManualClientCreationProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const { toast } = useToast();

  const form = useForm<ManualClientFormData>({
    resolver: zodResolver(manualClientSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      countryCode: "+965",
      dateOfBirth: "",
      gender: undefined, // Use undefined for enum fields to avoid type error
      serviceId: "",
    },
  });

  const loadServices = async () => {
    const { data, error } = await supabase
      .from("services")
      .select("id, name, type, price_kwd")
      .eq("is_active", true);

    if (error) {
      console.error("Error loading services:", error);
      return;
    }

    setServices(data || []);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      loadServices();
    } else {
      form.reset();
    }
  };

  const onSubmit = async (data: ManualClientFormData) => {
    setLoading(true);
    try {
      // Call edge function to create client properly with admin privileges
      const { data: result, error: fnError } = await supabase.functions.invoke('create-manual-client', {
        body: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phoneNumber: `${data.countryCode}${data.phoneNumber}`,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          serviceId: data.serviceId,
        },
      });

      if (fnError) throw fnError;
      if (!result?.success) throw new Error(result?.error || "Failed to create client");

      toast({
        title: "Manual Client Created",
        description: `${data.firstName} ${data.lastName} has been added and will receive a password setup email.`,
      });

      setOpen(false);
      form.reset();
      onClientCreated();
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <UserPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Payment Exempt Client</DialogTitle>
          <DialogDescription>
            Create a client account with an active subscription. Payment is waived for manually created clients.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <PersonalDetailsFields 
              control={form.control}
              phoneField="phoneNumber"
            />

            <FormField
              control={form.control}
              name="serviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Plan</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a service" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {services.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} - {service.price_kwd} KWD
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Client"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
