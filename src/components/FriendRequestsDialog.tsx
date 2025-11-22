import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  sender: {
    display_name: string;
  };
}

interface FriendRequestsDialogProps {
  currentUserId: string;
  onRequestAccepted: () => void;
}

const FriendRequestsDialog = ({ currentUserId, onRequestAccepted }: FriendRequestsDialogProps) => {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadRequests();
    }
    subscribeToRequests();
  }, [currentUserId, open]);

  const loadRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("friend_requests")
        .select(`
          id,
          sender_id,
          receiver_id,
          status,
          created_at,
          sender:profiles!friend_requests_sender_id_fkey(display_name)
        `)
        .eq("receiver_id", currentUserId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      console.error("Error loading requests:", error);
    }
  };

  const subscribeToRequests = () => {
    const channel = supabase
      .channel("friend-requests-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        () => {
          loadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleAccept = async (requestId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("accept_friend_request", {
        request_id: requestId,
      });

      if (error) throw error;

      toast({
        title: "Zaproszenie zaakceptowane!",
        description: "Możesz teraz rozmawiać z nowym znajomym",
      });

      loadRequests();
      onRequestAccepted();
    } catch (error: any) {
      toast({
        title: "Błąd",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", requestId);

      if (error) throw error;

      toast({
        title: "Zaproszenie odrzucone",
      });

      loadRequests();
    } catch (error: any) {
      toast({
        title: "Błąd",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="relative">
          <UserPlus className="w-4 h-4" />
          {requests.length > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {requests.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zaproszenia do znajomych</DialogTitle>
          <DialogDescription>
            Zarządzaj oczekującymi zaproszeniami
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {requests.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              Brak oczekujących zaproszeń
            </div>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {request.sender.display_name[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-sm">
                      {request.sender.display_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Chce dodać Cię do znajomych
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                    onClick={() => handleAccept(request.id)}
                    disabled={loading}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100"
                    onClick={() => handleReject(request.id)}
                    disabled={loading}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FriendRequestsDialog;