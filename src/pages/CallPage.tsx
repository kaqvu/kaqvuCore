import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CallSession {
  id: string;
  caller_id: string;
  receiver_id: string;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration: number | null;
  offer: string | null;
  answer: string | null;
  ice_candidates?: any[];
}

interface Friend {
  id: string;
  display_name: string;
  online_at: string | null;
}

const CallPage = () => {
  const { chatId } = useParams<{ chatId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const iceCandidatesProcessedRef = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session) navigate("/auth");
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) navigate("/auth");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user && chatId) initializeCall();
  }, [user?.id, chatId]);

  useEffect(() => {
    console.log("🔍 Local stream effect, has stream:", !!localStream, "has ref:", !!localAudioRef.current);
    if (!localStream) return;
    
    const setupLocal = () => {
      if (!localAudioRef.current) {
        console.log("⏳ Waiting for local audio ref...");
        setTimeout(setupLocal, 50);
        return;
      }
      
      console.log("🎤 Setting up local audio, tracks:", localStream.getTracks().length);
      localAudioRef.current.srcObject = localStream;
      localAudioRef.current.muted = true;
      
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(localStream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let frameId: number;
      
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average / 255);
        frameId = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      
      return () => {
        cancelAnimationFrame(frameId);
        audioContext.close();
      };
    };
    
    return setupLocal();
  }, [localStream]);

  useEffect(() => {
    console.log("🔍 Remote stream effect, has stream:", !!remoteStream, "has ref:", !!remoteAudioRef.current);
    if (!remoteStream) return;
    
    const setupRemote = () => {
      if (!remoteAudioRef.current) {
        console.log("⏳ Waiting for remote audio ref...");
        setTimeout(setupRemote, 50);
        return;
      }
      
      console.log("🔊 Setting up remote audio, tracks:", remoteStream.getTracks().length);
      
      remoteStream.getTracks().forEach(track => {
        console.log(`🎵 Remote track: ${track.kind}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
        if (track.kind === 'audio' && track.muted) {
          console.warn("⚠️ Remote track is muted!");
        }
      });
      
      const audio = remoteAudioRef.current;
      audio.srcObject = remoteStream;
      audio.volume = 1.0;
      
      audio.play().then(() => {
        console.log("✅ Remote audio playing");
      }).catch(err => {
        console.error("❌ Remote audio play error:", err);
      });
    };
    
    setupRemote();
  }, [remoteStream]);

  useEffect(() => {
    if (activeCall?.status === "active" && activeCall.answered_at) {
      const interval = setInterval(() => setCallDuration(prev => prev + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [activeCall?.status, activeCall?.answered_at]);

  const initializeCall = async () => {
    if (!user || !chatId) return;

    try {
      console.log("🚀 Initializing call");
      const ids = chatId.split('--');
      if (ids.length !== 2) {
        navigate(`/${chatId}`);
        return;
      }

      const friendId = ids.find(id => id !== user.id);
      if (!friendId) {
        navigate(`/${chatId}`);
        return;
      }

      const { data: friendship } = await supabase
        .from("friendships")
        .select("*")
        .eq("user_id", user.id)
        .eq("friend_id", friendId)
        .single();

      if (!friendship) {
        navigate(`/${chatId}`);
        return;
      }

      const { data: friendData } = await supabase
        .from("profiles")
        .select("id, display_name, online_at")
        .eq("id", friendId)
        .single();

      if (!friendData) {
        navigate(`/${chatId}`);
        return;
      }

      setFriend(friendData);

      const { data: callsAsCallerData } = await supabase
        .from("call_sessions")
        .select("*")
        .eq("caller_id", user.id)
        .eq("receiver_id", friendId)
        .in("status", ["ringing", "active"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: callsAsReceiverData } = await supabase
        .from("call_sessions")
        .select("*")
        .eq("caller_id", friendId)
        .eq("receiver_id", user.id)
        .in("status", ["ringing", "active"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const existingCall = callsAsCallerData || callsAsReceiverData;

      if (existingCall) {
        console.log("📞 Found existing call:", existingCall.status);
        if (existingCall.receiver_id === user.id && existingCall.status === "ringing") {
          await answerExistingCall(existingCall);
        } else {
          setActiveCall(existingCall);
          subscribeToCallUpdates(existingCall.id);
        }
      } else {
        console.log("📞 Starting new call");
        await startNewCall(friendId);
      }

      setLoading(false);
    } catch (error) {
      console.error("❌ Error initializing call:", error);
      navigate(`/${chatId}`);
    }
  };

  const addIceCandidates = async (pc: RTCPeerConnection, callId: string) => {
    try {
      console.log("🧊 Fetching ICE candidates");
      const { data: callData } = await supabase
        .from("call_sessions")
        .select("ice_candidates")
        .eq("id", callId)
        .single();

      const candidates = callData?.ice_candidates || [];
      console.log(`📦 Found ${candidates.length} candidates`);

      for (const candidate of candidates) {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("✅ Added ICE candidate");
          } else {
            pendingCandidatesRef.current.push(candidate);
          }
        } catch (error) {
          console.error("❌ Error adding candidate:", error);
        }
      }

      iceCandidatesProcessedRef.current = true;
    } catch (error) {
      console.error("❌ Error fetching candidates:", error);
    }
  };

  const processPendingCandidates = async (pc: RTCPeerConnection) => {
    console.log(`🔄 Processing ${pendingCandidatesRef.current.length} pending candidates`);
    for (const candidate of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("❌ Error adding pending candidate:", error);
      }
    }
    pendingCandidatesRef.current = [];
  };

  const startNewCall = async (friendId: string) => {
    try {
      console.log("🎤 Requesting mic access");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      console.log("✅ Got local stream");
      setLocalStream(stream);

      console.log("🔗 Creating peer connection");
      const pc = new RTCPeerConnection(iceServers);
      peerConnectionRef.current = pc;
      setPeerConnection(pc);

      pc.onconnectionstatechange = () => {
        console.log("🔌 Connection:", pc.connectionState);
        if (pc.connectionState === "connected") {
          console.log("✅ Peer connection established!");
        }
      };
      pc.oniceconnectionstatechange = () => {
        console.log("🧊 ICE:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          console.log("✅ ICE connection established!");
        }
      };
      pc.onicegatheringstatechange = () => {
        console.log("📡 ICE gathering:", pc.iceGatheringState);
      };

      stream.getTracks().forEach(track => {
        console.log("➕ Adding local track:", track.kind);
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        console.log("🎵 Received remote track:", event.track.kind);
        console.log("📦 Event streams:", event.streams.length);
        console.log("📦 Stream tracks:", event.streams[0]?.getTracks().length);
        
        const track = event.track;
        console.log(`🔍 Track details: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
        
        if (track.muted) {
          console.warn("⚠️ Track is muted on arrival!");
          track.onunmute = () => {
            console.log("🔊 Track unmuted!");
          };
        }
        
        const remote = new MediaStream(event.streams[0].getTracks());
        console.log("✅ Created remote MediaStream with", remote.getTracks().length, "tracks");
        
        remote.getTracks().forEach(t => {
          console.log(`  - Track: ${t.kind}, enabled: ${t.enabled}, muted: ${t.muted}, readyState: ${t.readyState}`);
        });
        
        setRemoteStream(remote);
        console.log("✅ Remote stream state updated");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("✅ Offer created");

      const iceCandidates: RTCIceCandidateInit[] = [];
      
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          console.log("✅ ICE gathering already complete");
          resolve();
          return;
        }
        
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("🧊 Got ICE candidate");
            iceCandidates.push(event.candidate.toJSON());
          } else {
            console.log("✅ ICE gathering complete");
            resolve();
          }
        };
        
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            console.log("✅ ICE gathering complete via state change");
            resolve();
          }
        };
        
        setTimeout(() => {
          console.log("⏰ ICE gathering timeout, proceeding with", iceCandidates.length, "candidates");
          resolve();
        }, 3000);
      });

      console.log("💾 Saving call with", iceCandidates.length, "ICE candidates");

      const { data: callData, error } = await supabase
        .from("call_sessions")
        .insert({
          caller_id: user!.id,
          receiver_id: friendId,
          status: "ringing",
          offer: JSON.stringify(offer),
          ice_candidates: iceCandidates,
        })
        .select()
        .single();

      if (error) throw error;
      console.log("✅ Call session created");
      setActiveCall(callData);

      pc.onicecandidate = async (event) => {
        if (event.candidate && callData) {
          console.log("🧊 New ICE candidate after save");
          const { data: currentCall } = await supabase
            .from("call_sessions")
            .select("ice_candidates")
            .eq("id", callData.id)
            .single();

          const candidates = currentCall?.ice_candidates || [];
          await supabase
            .from("call_sessions")
            .update({ ice_candidates: [...candidates, event.candidate.toJSON()] })
            .eq("id", callData.id);
        }
      };

      subscribeToCallUpdates(callData.id);
    } catch (error: any) {
      console.error("❌ Error starting call:", error);
      toast({
        title: "Błąd",
        description: "Nie można rozpocząć połączenia",
        variant: "destructive",
      });
      navigate(`/${chatId}`);
    }
  };

  const answerExistingCall = async (call: CallSession) => {
    try {
      console.log("📞 Answering call");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      console.log("✅ Got local stream");
      setLocalStream(stream);

      const pc = new RTCPeerConnection(iceServers);
      peerConnectionRef.current = pc;
      setPeerConnection(pc);

      pc.onconnectionstatechange = () => {
        console.log("🔌 Connection:", pc.connectionState);
        if (pc.connectionState === "connected") {
          console.log("✅ Peer connection established!");
        }
      };
      pc.oniceconnectionstatechange = () => {
        console.log("🧊 ICE:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          console.log("✅ ICE connection established!");
        }
      };
      pc.onicegatheringstatechange = () => {
        console.log("📡 ICE gathering:", pc.iceGatheringState);
      };

      stream.getTracks().forEach(track => {
        console.log("➕ Adding local track:", track.kind);
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        console.log("🎵 Received remote track:", event.track.kind);
        console.log("📦 Event streams:", event.streams.length);
        console.log("📦 Stream tracks:", event.streams[0]?.getTracks().length);
        
        const track = event.track;
        console.log(`🔍 Track details: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
        
        if (track.muted) {
          console.warn("⚠️ Track is muted on arrival!");
          track.onunmute = () => {
            console.log("🔊 Track unmuted!");
          };
        }
        
        const remote = new MediaStream(event.streams[0].getTracks());
        console.log("✅ Created remote MediaStream with", remote.getTracks().length, "tracks");
        
        remote.getTracks().forEach(t => {
          console.log(`  - Track: ${t.kind}, enabled: ${t.enabled}, muted: ${t.muted}, readyState: ${t.readyState}`);
        });
        
        setRemoteStream(remote);
        console.log("✅ Remote stream state updated");
      };

      if (call.offer) {
        console.log("📝 Setting remote description");
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(call.offer)));
        await addIceCandidates(pc, call.id);
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log("✅ Answer created");

      const iceCandidates: RTCIceCandidateInit[] = [];
      
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          console.log("✅ ICE gathering already complete");
          resolve();
          return;
        }
        
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("🧊 Got ICE candidate");
            iceCandidates.push(event.candidate.toJSON());
          } else {
            console.log("✅ ICE gathering complete");
            resolve();
          }
        };
        
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            console.log("✅ ICE gathering complete via state change");
            resolve();
          }
        };
        
        setTimeout(() => {
          console.log("⏰ ICE gathering timeout, proceeding with", iceCandidates.length, "candidates");
          resolve();
        }, 3000);
      });

      console.log("💾 Saving answer with", iceCandidates.length, "ICE candidates");

      await supabase
        .from("call_sessions")
        .update({
          status: "active",
          answered_at: new Date().toISOString(),
          answer: JSON.stringify(answer),
          ice_candidates: iceCandidates,
        })
        .eq("id", call.id);

      setActiveCall({ 
        ...call, 
        status: "active", 
        answered_at: new Date().toISOString(), 
        answer: JSON.stringify(answer) 
      });

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log("🧊 New ICE candidate after answer");
          const { data: currentCall } = await supabase
            .from("call_sessions")
            .select("ice_candidates")
            .eq("id", call.id)
            .single();

          const candidates = currentCall?.ice_candidates || [];
          await supabase
            .from("call_sessions")
            .update({ ice_candidates: [...candidates, event.candidate.toJSON()] })
            .eq("id", call.id);
        }
      };

      subscribeToCallUpdates(call.id);
    } catch (error: any) {
      console.error("❌ Error answering call:", error);
      toast({
        title: "Błąd",
        description: "Nie można odebrać połączenia",
        variant: "destructive",
      });
      navigate(`/${chatId}`);
    }
  };

  const subscribeToCallUpdates = (callId: string) => {
    let lastCandidatesCount = 0;
    
    const checkForNewCandidates = async () => {
      const pc = peerConnectionRef.current;
      if (!pc) {
        console.log("⚠️ No peer connection in checkForNewCandidates");
        return;
      }
      
      try {
        const { data: callData } = await supabase
          .from("call_sessions")
          .select("ice_candidates")
          .eq("id", callId)
          .single();
        
        const candidates = callData?.ice_candidates || [];
        
        if (candidates.length > lastCandidatesCount) {
          console.log(`🆕 New ICE candidates detected: ${lastCandidatesCount} -> ${candidates.length}`);
          
          for (let i = lastCandidatesCount; i < candidates.length; i++) {
            try {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidates[i]));
                console.log("✅ Added new ICE candidate from database");
              } else {
                console.log("⏳ Queuing ICE candidate (no remote description yet)");
                pendingCandidatesRef.current.push(candidates[i]);
              }
            } catch (error) {
              console.error("❌ Error adding new candidate:", error);
            }
          }
          
          lastCandidatesCount = candidates.length;
        }
      } catch (error) {
        console.error("❌ Error checking candidates:", error);
      }
    };
    
    const candidateCheckInterval = setInterval(checkForNewCandidates, 500);
    
    const channel = supabase
      .channel(`call-${callId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
          filter: `id=eq.${callId}`,
        },
        async (payload) => {
          const call = payload.new as CallSession;
          const pc = peerConnectionRef.current;
          
          console.log("📨 Call update:", call.status);
          console.log("📋 Has answer:", !!call.answer);
          console.log("📋 Has remote description:", !!pc?.currentRemoteDescription);
          
          if (call.status === "active" && call.answer && pc) {
            console.log("🔍 Processing active call with answer");
            
            if (!pc.currentRemoteDescription) {
              try {
                console.log("📝 Setting remote answer from database");
                console.log("📝 Answer length:", call.answer.length);
                
                await pc.setRemoteDescription(
                  new RTCSessionDescription(JSON.parse(call.answer))
                );
                console.log("✅ Remote answer set successfully");
                
                await processPendingCandidates(pc);
                
                if (!iceCandidatesProcessedRef.current) {
                  await addIceCandidates(pc, callId);
                }
                
                await checkForNewCandidates();
              } catch (error) {
                console.error("❌ Error setting remote description:", error);
              }
            } else {
              console.log("ℹ️ Remote description already set, checking for new candidates");
              await checkForNewCandidates();
            }
          } else if (call.status === "ended" || call.status === "missed") {
            clearInterval(candidateCheckInterval);
            endCall();
          }

          setActiveCall(call);
        }
      )
      .subscribe();

    console.log("👂 Subscribed to call updates for:", callId);

    return () => {
      console.log("🔌 Unsubscribing from call updates");
      clearInterval(candidateCheckInterval);
      supabase.removeChannel(channel);
    };
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const endCall = async () => {
    console.log("📴 Ending call");
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnectionRef.current = null;
      setPeerConnection(null);
    }

    setRemoteStream(null);

    if (activeCall) {
      const duration = activeCall.answered_at
        ? Math.floor((new Date().getTime() - new Date(activeCall.answered_at).getTime()) / 1000)
        : null;

      await supabase
        .from("call_sessions")
        .update({
          status: activeCall.answered_at ? "ended" : "missed",
          ended_at: new Date().toISOString(),
          duration: duration,
        })
        .eq("id", activeCall.id);
    }

    navigate(`/${chatId}`);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading || !user || !friend) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Łączenie...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      <div className="p-4 border-b border-border bg-card flex items-center justify-center">
        <h2 className="font-semibold text-lg">{friend.display_name}</h2>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center space-y-8">
            <div className="flex gap-4">
              <div className="w-24 h-24 rounded-2xl bg-primary/20 flex items-center justify-center">
                <div className="w-20 h-20 rounded-xl bg-primary/40 animate-pulse" />
              </div>
              <div className="w-24 h-24 rounded-2xl bg-primary/20 flex items-center justify-center">
                <div className="w-20 h-20 rounded-xl bg-primary/40 animate-pulse" style={{ animationDelay: "0.5s" }} />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-3xl font-mono text-muted-foreground">
                {activeCall?.status === "active" ? formatDuration(callDuration) : "Dzwoni..."}
              </p>
              <p className="text-sm text-muted-foreground">
                ICE: {peerConnection?.iceConnectionState || "Łączenie..."}
              </p>
            </div>

            <div 
              className="w-full h-4 rounded-full transition-colors duration-100"
              style={{
                backgroundColor: audioLevel > 0.05 ? `rgba(34, 197, 94, ${0.3 + audioLevel * 0.7})` : 'rgb(107, 114, 128)',
              }}
            />
            
            <div className="text-xs text-muted-foreground space-y-1 text-center">
              <div>Local: {localStream?.getTracks().length || 0} | Remote: {remoteStream?.getTracks().length || 0}</div>
              <div>Level: {(audioLevel * 100).toFixed(0)}%</div>
            </div>

            <div className="flex gap-4">
              <Button
                size="lg"
                variant={isMuted ? "default" : "secondary"}
                className={`w-16 h-16 rounded-full ${isMuted ? "bg-red-600 hover:bg-red-700" : ""}`}
                onClick={toggleMute}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </Button>
              <Button
                size="lg"
                variant="destructive"
                className="w-16 h-16 rounded-full"
                onClick={endCall}
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <audio 
        ref={localAudioRef} 
        autoPlay 
        playsInline 
        muted 
        onLoadedMetadata={() => console.log("📼 Local audio metadata loaded")}
        onCanPlay={() => console.log("✅ Local audio can play")}
      />
      <audio 
        ref={remoteAudioRef} 
        autoPlay 
        playsInline 
        onLoadedMetadata={() => console.log("📼 Remote audio metadata loaded")}
        onCanPlay={() => console.log("✅ Remote audio can play")}
        onPlay={() => console.log("▶️ Remote audio is playing")}
        onVolumeChange={(e) => console.log("🔊 Volume:", (e.target as HTMLAudioElement).volume)}
      />
    </div>
  );
};

export default CallPage;