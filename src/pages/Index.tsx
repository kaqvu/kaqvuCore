import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import FriendsList from "@/components/FriendsList";
import SettingsModal from "@/components/SettingsModal";
import { MessageSquare } from "lucide-react";

interface Friend {
  id: string;
  display_name: string;
  online_at: string | null;
}

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (!session) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      loadProfile();
      updateOnlineStatus();
      const interval = setInterval(updateOnlineStatus, 60000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

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

  const handleSelectFriend = (friend: Friend) => {
    const chatId = [user!.id, friend.id].sort().join('--');
    navigate(`/${chatId}`);
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

  return (
    <div className="flex h-screen bg-background relative">
      <FriendsList
        currentUserId={user.id}
        selectedFriend={null}
        onSelectFriend={handleSelectFriend}
      />
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-flex p-4 rounded-full bg-primary/10 mb-4">
            <MessageSquare className="w-12 h-12 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Witaj w kaqvuCore</h2>
          <p className="text-muted-foreground">
            Wybierz znajomego aby rozpocząć rozmowę
          </p>
        </div>
      </div>
      <SettingsModal
        userId={user.id}
        currentDisplayName={displayName}
        email={email}
        createdAt={createdAt}
        onDisplayNameUpdate={loadProfile}
      />
    </div>
  );
};

export default Index;