import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import FriendRequestsDialog from "./FriendRequestsDialog";

interface Friend {
  id: string;
  display_name: string;
  online_at: string | null;
}

interface FriendsListProps {
  currentUserId: string;
  selectedFriend: Friend | null;
  onSelectFriend: (friend: Friend) => void;
}

const FriendsList = ({ currentUserId, selectedFriend, onSelectFriend }: FriendsListProps) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchName, setSearchName] = useState("");
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadFriends();
    subscribeToFriendships();
    subscribeToProfiles();
  }, [currentUserId]);

  const loadFriends = async () => {
    try {
      const { data: friendships, error } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", currentUserId);

      if (error) throw error;

      if (friendships && friendships.length > 0) {
        const friendIds = friendships.map((f) => f.friend_id);
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("*")
          .in("id", friendIds);

        if (profilesError) throw profilesError;
        setFriends(profiles || []);
      } else {
        setFriends([]);
      }
    } catch (error: any) {
      console.error("Błąd w ładowaniu znajomych:", error);
    }
  };

  const subscribeToFriendships = () => {
    const channel = supabase
      .channel("friendships-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          loadFriends();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToProfiles = () => {
    const channel = supabase
      .channel("profiles-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        () => {
          loadFriends();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleAddFriend = async () => {
    if (!searchName.trim()) return;

    setIsAddingFriend(true);
    try {
      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("display_name", searchName.trim())
        .single();

      if (userError || !userData) {
        toast({
          title: "Nie znaleziono użytkownika",
          description: "Wprowadź poprawną nazwę użytkownika",
          variant: "destructive",
        });
        return;
      }

      const friendId = userData.id;

      if (friendId === currentUserId) {
        toast({
          title: "Błąd",
          description: "Nie możesz dodać samego siebie",
          variant: "destructive",
        });
        return;
      }

      const { data: existingFriendship } = await supabase
        .from("friendships")
        .select("*")
        .eq("user_id", currentUserId)
        .eq("friend_id", friendId)
        .single();

      if (existingFriendship) {
        toast({
          title: "Jesteście już znajomymi",
          description: "Jesteś już znajomym z tym użytkownikiem",
        });
        return;
      }

      const { data: existingRequest } = await supabase
        .from("friend_requests")
        .select("*")
        .eq("sender_id", currentUserId)
        .eq("receiver_id", friendId)
        .eq("status", "pending")
        .single();

      if (existingRequest) {
        toast({
          title: "Zaproszenie już wysłane",
          description: "Zaproszenie do tego użytkownika już oczekuje",
        });
        return;
      }

      const { data: incomingRequest } = await supabase
        .from("friend_requests")
        .select("*")
        .eq("sender_id", friendId)
        .eq("receiver_id", currentUserId)
        .eq("status", "pending")
        .single();

      if (incomingRequest) {
        toast({
          title: "Ta osoba już Cię zaprosiła",
          description: "Sprawdź swoje oczekujące zaproszenia",
        });
        return;
      }

      const { error: insertError } = await supabase
        .from("friend_requests")
        .insert({
          sender_id: currentUserId,
          receiver_id: friendId,
          status: "pending",
        });

      if (insertError) throw insertError;

      toast({
        title: "Zaproszenie wysłane!",
        description: "Poczekaj aż użytkownik zaakceptuje zaproszenie",
      });

      setSearchName("");
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Błąd",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAddingFriend(false);
    }
  };

  const isOnline = (onlineAt: string | null) => {
    if (!onlineAt) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(onlineAt) > fiveMinutesAgo;
  };

  return (
    <div className="w-64 bg-chat-sidebar border-r border-border flex flex-col h-screen">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-lg">Znajomi</h2>
        <div className="flex gap-1">
          <FriendRequestsDialog
            currentUserId={currentUserId}
            onRequestAccepted={loadFriends}
          />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost">
                <UserPlus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dodaj znajomego</DialogTitle>
                <DialogDescription>
                  Wpisz nazwę swojego znajomego
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 mt-4">
                <Input
                  placeholder="Nazwa użytkownika"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddFriend()}
                />
                <Button onClick={handleAddFriend} disabled={isAddingFriend}>
                  Wyślij
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {friends.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Nie masz dodanych żadnych znajomych. Dodaj kogoś aby zacząć rozmowę!
          </div>
        ) : (
          friends.map((friend) => (
            <button
              key={friend.id}
              onClick={() => onSelectFriend(friend)}
              className={`w-full p-3 flex items-center gap-3 hover:bg-secondary/50 transition-colors ${
                selectedFriend?.id === friend.id ? "bg-secondary" : ""
              }`}
            >
              <div className="relative">
                <Avatar>
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {friend.display_name[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-chat-sidebar ${
                    isOnline(friend.online_at) ? "bg-status-online" : "bg-status-offline"
                  }`}
                />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-sm">{friend.display_name}</div>
                <div className="text-xs text-muted-foreground">
                  {isOnline(friend.online_at) ? "Online" : "Offline"}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default FriendsList;