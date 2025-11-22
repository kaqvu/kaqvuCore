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
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EditDisplayNameDialogProps {
  userId: string;
  currentDisplayName: string;
  onUpdate: () => void;
  canChange: boolean;
  daysUntilChange: number;
}

const EditDisplayNameDialog = ({
  userId,
  currentDisplayName,
  onUpdate,
  canChange,
  daysUntilChange,
}: EditDisplayNameDialogProps) => {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setDisplayName(currentDisplayName);
  }, [currentDisplayName, open]);

  const isValid = displayName.trim().length >= 3 && displayName.trim().length <= 16;

  const handleSave = async () => {
    if (!isValid || !canChange) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: "Sukces",
        description: "Nazwa użytkownika zaktualizowana",
      });
      onUpdate();
      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Błąd",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        disabled={!canChange}
      >
        <Pencil className="w-4 h-4 text-blue-500" />
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zmień nazwę użytkownika</DialogTitle>
          <DialogDescription>
            Nazwa musi mieć od 3 do 16 znaków i nie może być obraźliwa
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="newDisplayName">Nowa nazwa użytkownika</Label>
            <Input
              id="newDisplayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Twoja nazwa użytkownika"
              maxLength={16}
            />
            <p className="text-xs text-muted-foreground">
              {displayName.trim().length}/16 znaków
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Anuluj
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="flex-1"
            >
              {saving ? "Zapisywanie..." : "Zapisz zmiany"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditDisplayNameDialog;