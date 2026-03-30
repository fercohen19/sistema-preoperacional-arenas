"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveRoleHome } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export function LoginForm() {
  const router = useRouter();
  const [role, setRole] = useState<"conductor" | "administrador">("conductor");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const configured = isSupabaseConfigured();

  return (
    <form
      className="stack-md"
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        setMessage("");

        const formData = new FormData(event.currentTarget);
        const email = String(formData.get("email") ?? "");
        const password = String(formData.get("password") ?? "");

        if (!configured) {
          setMessage(
            "Supabase aun no esta configurado. Por ahora el acceso navega en modo base segun el rol seleccionado."
          );
          router.push(resolveRoleHome(role));
          setLoading(false);
          return;
        }

        if (!supabase) {
          setMessage(
            "No fue posible iniciar autenticacion real porque Supabase no esta configurado aun."
          );
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          setMessage(error.message);
          setLoading(false);
          return;
        }

        router.push(resolveRoleHome(role));
        router.refresh();
        setLoading(false);
      }}
    >
      <div className="segmented-control" role="tablist" aria-label="Rol">
        <button
          className={role === "conductor" ? "segment is-active" : "segment"}
          onClick={(event) => {
            event.preventDefault();
            setRole("conductor");
          }}
          type="button"
        >
          Conductor
        </button>
        <button
          className={role === "administrador" ? "segment is-active" : "segment"}
          onClick={(event) => {
            event.preventDefault();
            setRole("administrador");
          }}
          type="button"
        >
          Administrador
        </button>
      </div>

      <label className="field">
        <span>Usuario o correo</span>
        <input
          name="email"
          placeholder="usuario@arenastransporte.com"
          type="text"
        />
      </label>

      <label className="field">
        <span>Clave</span>
        <input name="password" placeholder="••••••••" type="password" />
      </label>

      <button className="primary-button" type="submit">
        {loading ? "Ingresando..." : `Ingresar como ${role}`}
      </button>

      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
