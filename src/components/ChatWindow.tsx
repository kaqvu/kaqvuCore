import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Phone, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

interface CallSession {
  id: string;
  caller_id: string;
  receiver_id: string;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration: number | null;
}

interface Friend {
  id: string;
  display_name: string;
}

interface ChatWindowProps {
  currentUserId: string;
  friend: Friend;
}

const ChatWindow = ({ currentUserId, friend }: ChatWindowProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadMessages();
    subscribeToMessages();
  }, [friend.id, currentUserId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    try {
      const { data: messagesData, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${currentUserId})`
        )
        .order("created_at", { ascending: true });

      if (messagesError) throw messagesError;

      const { data: callsData, error: callsError } = await supabase
        .from("call_sessions")
        .select("*")
        .or(
          `and(caller_id.eq.${currentUserId},receiver_id.eq.${friend.id}),and(caller_id.eq.${friend.id},receiver_id.eq.${currentUserId})`
        )
        .in("status", ["ended", "missed"])
        .order("started_at", { ascending: true });

      if (callsError) throw callsError;

      const combined = [
        ...(messagesData || []).map((m) => ({ ...m, type: "message" })),
        ...(callsData || []).map((c) => ({ ...c, type: "call" })),
      ].sort((a, b) => {
        const timeA = new Date(a.created_at || a.started_at).getTime();
        const timeB = new Date(b.created_at || b.started_at).getTime();
        return timeA - timeB;
      });

      setMessages(combined as any);
    } catch (error: any) {
      console.error("Error loading messages:", error);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel("messages-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (
            (newMsg.sender_id === currentUserId && newMsg.receiver_id === friend.id) ||
            (newMsg.sender_id === friend.id && newMsg.receiver_id === currentUserId)
          ) {
            setMessages((prev) => [...prev, { ...newMsg, type: "message" } as any]);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
        },
        (payload) => {
          const call = payload.new as CallSession;
          if (
            (call.status === "ended" || call.status === "missed") &&
            ((call.caller_id === currentUserId && call.receiver_id === friend.id) ||
             (call.caller_id === friend.id && call.receiver_id === currentUserId))
          ) {
            loadMessages();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        sender_id: currentUserId,
        receiver_id: friend.id,
        content: newMessage.trim(),
      });

      if (error) throw error;
      setNewMessage("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const startCall = () => {
    const chatId = [currentUserId, friend.id].sort().join('--');
    navigate(`/${chatId}/call`);
  };

  const exitChat = () => {
    navigate('/');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-background">
      <div className="p-4 border-b border-border bg-card flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={exitChat}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="font-semibold text-lg">{friend.display_name}</h2>
        </div>
        <Button size="icon" variant="ghost" onClick={startCall}>
          <Phone className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((item: any) => {
            if (item.type === "call") {
              const isOwn = item.caller_id === currentUserId;
              return (
                <div key={item.id} className="flex justify-center">
                  <div className="bg-secondary px-4 py-2 rounded-lg text-sm text-muted-foreground">
                    {item.status === "missed" ? (
                      <span>
                        {isOwn ? "Nieodebrane połączenie" : "Nieodebrane połączenie od " + friend.display_name}
                      </span>
                    ) : (
                      <span>
                        Rozmowa trwała {formatDuration(item.duration || 0)}
                      </span>
                    )}
                    <span className="ml-2">
                      {format(new Date(item.started_at), "HH:mm")}
                    </span>
                  </div>
                </div>
              );
            }

            const isOwn = item.sender_id === currentUserId;
            return (
              <div
                key={item.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    isOwn
                      ? "bg-chat-own text-white"
                      : "bg-chat-message text-foreground"
                  }`}
                >
                  <div className="break-words">{item.content}</div>
                  <div
                    className={`text-xs mt-1 ${
                      isOwn ? "text-white/70" : "text-muted-foreground"
                    }`}
                  >
                    {format(new Date(item.created_at), "HH:mm")}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-card">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Message ${friend.display_name}`}
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={sending || !newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ChatWindow;