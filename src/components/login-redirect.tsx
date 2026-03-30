"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resolveRoleHome } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export function LoginRedirect() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function redirectIfLoggedIn() {
      if (!supabase) {
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const { data: appUser } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!appUser || !active) {
        return;
      }

      router.replace(resolveRoleHome(appUser.rol));
    }

    void redirectIfLoggedIn();

    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
