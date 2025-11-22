import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get("token");
      const type = searchParams.get("type");

      if (!token || type !== "email") {
        setStatus("error");
        setMessage("Invalid verification link");
        return;
      }

      try {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: "email",
        });

        if (error) {
          setStatus("error");
          setMessage("Verification failed. The link may have expired or is invalid.");
        } else {
          setStatus("success");
          setMessage("Email verified successfully! You can now sign in.");
        }
      } catch (error) {
        setStatus("error");
        setMessage("An error occurred during verification.");
      }
    };

    verifyEmail();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            {status === "loading" && (
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            )}
            {status === "success" && (
              <CheckCircle className="w-12 h-12 text-green-500" />
            )}
            {status === "error" && (
              <XCircle className="w-12 h-12 text-destructive" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {status === "loading" && "Verifying Email..."}
            {status === "success" && "Verification Completed"}
            {status === "error" && "Verification Uncompleted"}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          {status !== "loading" && (
            <Button
              onClick={() => navigate("/auth")}
              className="w-full"
            >
              {status === "success" ? "Go to Sign In" : "Try Again"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyEmail;
