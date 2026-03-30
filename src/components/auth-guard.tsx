"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { resolveRoleHome } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { supabase } from "@/lib/supabase";

interface AuthGuardProps {
  requiredRole: Role;
  children: React.ReactNode;
}

export function AuthGuard({ requiredRole, children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"checking" | "allowed" | "blocked">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function verifyAccess() {
      if (!supabase) {
        if (!active) {
          return;
        }

        setStatus("blocked");
        setMessage("No fue posible verificar la sesion. Configura Supabase para habilitar el acceso protegido.");
        return;
      }

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!active) {
          return;
        }

        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      const { data: appUser, error: appUserError } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (appUserError || !appUser) {
        if (!active) {
          return;
        }

        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (appUser.rol !== requiredRole) {
        if (!active) {
          return;
        }

        router.replace(resolveRoleHome(appUser.rol));
        return;
      }

      if (!active) {
        return;
      }

      setStatus("allowed");
    }

    void verifyAccess();

    return () => {
      active = false;
    };
  }, [pathname, requiredRole, router]);

  if (status === "checking") {
    return <p className="muted">Verificando sesion y permisos...</p>;
  }

  if (status === "blocked") {
    return <p className="admin-alert admin-alert--danger">{message}</p>;
  }

  return <>{children}</>;
}
