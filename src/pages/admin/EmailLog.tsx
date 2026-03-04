import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function EmailLog() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/admin/email-manager", { replace: true });
  }, [navigate]);

  return null;
}
