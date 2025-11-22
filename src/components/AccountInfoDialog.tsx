import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AccountInfoDialogProps {
  userId: string;
  createdAt: string;
}

const AccountInfoDialog = ({ userId, createdAt }: AccountInfoDialogProps) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const copyUserId = () => {
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Skopiowano!",
      description: "ID użytkownika skopiowane do schowka",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        Informacje konta
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Informacje konta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Twoje ID</Label>
            <div className="flex gap-2">
              <Input value={userId} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copyUserId}>
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Data założenia
            </Label>
            <Input value={formatDate(createdAt)} readOnly className="text-sm" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AccountInfoDialog;