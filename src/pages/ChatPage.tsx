import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import FriendsList from "@/components/FriendsList";
import ChatWindow from "@/components/ChatWindow";
import SettingsModal from "@/components/SettingsModal";

interface Friend {
  id: string;
  display_name: string;
  online_at: string | null;
}

const ChatPage = () => {
  const { chatId } = useParams<{ chatId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [chatNotFound, setChatNotFound] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user && chatId) {
      loadChatData();
      updateOnlineStatus();
      const interval = setInterval(updateOnlineStatus, 60000);
      return () => clearInterval(interval);
    }
  }, [user?.id, chatId]);

  const loadChatData = async () => {
    if (!user || !chatId) return;

    try {
      const ids = chatId.split('--');
      
      if (ids.length !== 2) {
        setChatNotFound(true);
        setLoading(false);
        return;
      }

      const friendId = ids.find(id => id !== user.id);
      
      if (!friendId) {
        setChatNotFound(true);
        setLoading(false);
        return;
      }

      const { data: friendship, error: friendshipError } = await supabase
        .from("friendships")
        .select("*")
        .eq("user_id", user.id)
        .eq("friend_id", friendId)
        .maybeSingle();

      if (friendshipError) {
        setChatNotFound(true);
        setLoading(false);
        return;
      }

      if (!friendship) {
        setChatNotFound(true);
        setLoading(false);
        return;
      }

      const { data: friendData, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, online_at")
        .eq("id", friendId)
        .single();

      if (profileError || !friendData) {
        setChatNotFound(true);
        setLoading(false);
        return;
      }

      setFriend(friendData);
      await loadProfile();
      setLoading(false);
    } catch (error) {
      console.error("Error loading chat:", error);
      setChatNotFound(true);
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, email, created_at")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      if (data) {
        setDisplayName(data.display_name);
        setEmail(data.email);
        setCreatedAt(data.created_at);
      }
    } catch (error: any) {
      console.error("Error loading profile:", error);
    }
  };

  const updateOnlineStatus = async () => {
    if (!user) return;
    try {
      await supabase
        .from("profiles")
        .update({ online_at: new Date().toISOString() })
        .eq("id", user.id);
    } catch (error: any) {
      console.error("Error updating online status:", error);
    }
  };

  const handleSelectFriend = (newFriend: Friend) => {
    const newChatId = [user!.id, newFriend.id].sort().join('--');
    navigate(`/${newChatId}`);
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Ładowanie...</p>
        </div>
      </div>
    );
  }

  if (chatNotFound) {
    return (
      <div className="flex h-screen bg-background">
        <FriendsList
          currentUserId={user.id}
          selectedFriend={null}
          onSelectFriend={handleSelectFriend}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Nie znaleziono czatu</h2>
            <p className="text-muted-foreground">
              Ten czat nie istnieje lub nie masz do niego dostępu
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!friend) return null;

  return (
    <div className="flex h-screen bg-background relative">
      <FriendsList
        currentUserId={user.id}
        selectedFriend={friend}
        onSelectFriend={handleSelectFriend}
      />
      <ChatWindow currentUserId={user.id} friend={friend} />
    </div>
  );
};

export default ChatPage;