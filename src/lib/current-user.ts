"use client";

import { useEffect, useState } from "react";
import type { Role } from "./types";
import { supabase } from "./supabase";

export type CurrentAppUser = {
  rol: Role;
  documento: string;
  nombreCompleto: string;
};

export function useCurrentAppUser() {
  const [user, setUser] = useState<CurrentAppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      if (!supabase) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      const {
        data: { user: authUser }
      } = await supabase.auth.getUser();

      if (!authUser) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("usuarios")
        .select("rol, documento, nombre_completo")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      setUser(
        data
          ? {
              rol: data.rol,
              documento: data.documento ?? "",
              nombreCompleto: data.nombre_completo
            }
          : null
      );
      setLoading(false);
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, []);

  return { user, loading };
}
