import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Settings, LogOut, Trash2, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import EditDisplayNameDialog from "./EditDisplayNameDialog";
import AccountInfoDialog from "./AccountInfoDialog";

interface SettingsModalProps {
  userId: string;
  currentDisplayName: string;
  email: string;
  createdAt: string;
  onDisplayNameUpdate: () => void;
}

const SettingsModal = ({
  userId,
  currentDisplayName,
  email,
  createdAt,
  onDisplayNameUpdate,
}: SettingsModalProps) => {
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const [displayNameChangedAt, setDisplayNameChangedAt] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadDisplayNameChangeDate();
  }, [userId]);

  const loadDisplayNameChangeDate = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name_changed_at")
        .eq("id", userId)
        .single();

      if (error) throw error;
      if (data) {
        setDisplayNameChangedAt(data.display_name_changed_at);
      }
    } catch (error: any) {
      console.error("Error loading display name change date:", error);
    }
  };

  const getDaysUntilChange = () => {
    if (!displayNameChangedAt) return 0;
    const changedDate = new Date(displayNameChangedAt);
    const now = new Date();
    const diffTime = now.getTime() - changedDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, 14 - diffDays);
  };

  const canChangeName = () => {
    if (!displayNameChangedAt) return true;
    return getDaysUntilChange() === 0;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("delete_user_account");

      if (error) throw error;

      toast({
        title: "Konto usunięte",
        description: "Twoje konto zostało trwale usunięte",
      });

      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Błąd",
        description: error.message,
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  const handleDisplayNameUpdated = () => {
    onDisplayNameUpdate();
    loadDisplayNameChangeDate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="absolute top-4 right-4">
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ustawienia konta</DialogTitle>
          <DialogDescription>
            Zarządzaj swoją nazwą użytkownika i kontem
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Nazwa użytkownika</Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help">
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs" side="right">
                    <p className="text-sm">
                      Uwaga: jeśli twoja nazwa w kaqvuCore została zmieniona, nie
                      możesz zmienić jej ponownie w ciągu 2 tygodni po
                      zatwierdzeniu takiej zmiany.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex gap-2 items-center">
              <Input value={currentDisplayName} readOnly className="flex-1" />
              <EditDisplayNameDialog
                userId={userId}
                currentDisplayName={currentDisplayName}
                onUpdate={handleDisplayNameUpdated}
                canChange={canChangeName()}
                daysUntilChange={getDaysUntilChange()}
              />
            </div>
            {!canChangeName() && (
              <p className="text-xs text-muted-foreground">
                Następna możliwa zmiana za {getDaysUntilChange()} dni
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Wyślij ją swoim znajomym, aby mogli ciebie dodać
            </p>
          </div>

          <AccountInfoDialog userId={userId} email={email} createdAt={createdAt} />

          <Button onClick={handleSignOut} variant="outline" className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            Wyloguj się
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Trash2 className="w-4 h-4 mr-2" />
                Usuń konto
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Czy na pewno chcesz usunąć konto?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Ta akcja jest nieodwracalna. Wszystkie twoje dane, wiadomości
                  i znajomości zostaną trwale usunięte.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Anuluj</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Usuwanie..." : "Usuń na zawsze"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;