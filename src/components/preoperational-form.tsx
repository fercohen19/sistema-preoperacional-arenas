"use client";

import { useEffect, useMemo, useState } from "react";
import { SignaturePad } from "@/components/signature-pad";
import { checklistItems, requiredEvidence } from "@/lib/checklist";
import { evaluateInspectionResult, missingRequiredEvidence } from "@/lib/inspection";
import { savePreoperationalInspection } from "@/lib/preoperational";
import { mockDrivers, mockVehicles } from "@/lib/mock-data";
import { useCurrentAppUser } from "@/lib/current-user";
import { supabase } from "@/lib/supabase";
import type { EvidenceType, EvidenceUploadState } from "@/lib/types";

type PreopVehicleOption = {
  placa: string;
  tipoVehiculo: string;
};

type PreopDriverOption = {
  documento: string;
  nombreCompleto: string;
};

export function PreoperationalForm() {
  const [vehicles, setVehicles] = useState<PreopVehicleOption[]>(mockVehicles);
  const [drivers, setDrivers] = useState<PreopDriverOption[]>(mockDrivers);
  const [itemValues, setItemValues] = useState<Record<string, string>>(
    Object.fromEntries(
      checklistItems.map((item) => [item.codigo, item.tipo === "estado" ? "Bueno" : ""])
    )
  );
  const [evidenceValues, setEvidenceValues] = useState<
    Partial<Record<EvidenceType, EvidenceUploadState>>
  >({});
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plate, setPlate] = useState(mockVehicles[0]?.placa ?? "");
  const [driverDocument, setDriverDocument] = useState(
    mockDrivers[0]?.documento ?? ""
  );
  const [kilometraje, setKilometraje] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const { user: currentUser } = useCurrentAppUser();

  const currentResult = useMemo(
    () => evaluateInspectionResult(itemValues),
    [itemValues]
  );
  const driverOptions = useMemo(() => {
    if (currentUser?.rol === "conductor" && currentUser.documento) {
      return drivers.filter((driver) => driver.documento === currentUser.documento);
    }

    return drivers;
  }, [currentUser, drivers]);

  useEffect(() => {
    async function loadMasterData() {
      if (!supabase) {
        return;
      }

      const [{ data: vehicleRows, error: vehicleError }, { data: driverRows, error: driverError }] =
        await Promise.all([
          supabase
            .from("vehiculos")
            .select("placa, tipo_vehiculo, estado")
            .eq("estado", "ACTIVO")
            .order("placa"),
          supabase
            .from("conductores")
            .select("documento, nombre_completo, estado")
            .eq("estado", "ACTIVO")
            .order("nombre_completo")
        ]);

      if (!vehicleError && vehicleRows?.length) {
        const nextVehicles = vehicleRows.map((vehicle) => ({
          placa: vehicle.placa,
          tipoVehiculo: vehicle.tipo_vehiculo
        }));
        setVehicles(nextVehicles);
        setPlate((current) =>
          current && nextVehicles.some((vehicle) => vehicle.placa === current)
            ? current
            : (nextVehicles[0]?.placa ?? "")
        );
      }

      if (!driverError && driverRows?.length) {
        const nextDrivers = driverRows.map((driver) => ({
          documento: driver.documento,
          nombreCompleto: driver.nombre_completo
        }));
        setDrivers(nextDrivers);
        setDriverDocument((current) =>
          current && nextDrivers.some((driver) => driver.documento === current)
            ? current
            : (nextDrivers[0]?.documento ?? "")
        );
      }
    }

    void loadMasterData();
  }, []);

  useEffect(() => {
    if (currentUser?.rol === "conductor" && currentUser.documento) {
      setDriverDocument(currentUser.documento);
    }
  }, [currentUser]);

  const toggleEnumListValue = (itemCode: string, option: string) => {
    setItemValues((current) => {
      const currentValues = current[itemCode]
        ? current[itemCode].split(" | ").filter(Boolean)
        : [];

      const nextValues = currentValues.includes(option)
        ? currentValues.filter((value) => value !== option)
        : [...currentValues, option];

      return {
        ...current,
        [itemCode]: nextValues.join(" | ")
      };
    });
  };

  return (
    <form
      className="stack-lg"
      onSubmit={async (event) => {
        event.preventDefault();
        setStatusMessage("");
        const missing = missingRequiredEvidence(evidenceValues);

        if (missing.length > 0) {
          setStatusMessage(
            `Faltan evidencias obligatorias: ${missing.join(", ")}.`
          );
          return;
        }

        if (!kilometraje.trim()) {
          setStatusMessage("Debes ingresar el kilometraje antes de cerrar la inspeccion.");
          return;
        }

        try {
          setIsSubmitting(true);

          const saved = await savePreoperationalInspection({
            placa: plate,
            conductorDocumento: driverDocument,
            kilometraje: Number(kilometraje),
            observaciones,
            resultado: currentResult,
            itemValues,
            evidenceValues
          });

          setStatusMessage(
            `Inspeccion guardada en Supabase con codigo ${saved.code}. El PDF fue generado y almacenado correctamente.`
          );
        } catch (error) {
          const message = (() => {
            if (error instanceof Error) {
              return error.message;
            }

            if (typeof error === "object" && error) {
              return JSON.stringify(error);
            }

            return "No fue posible guardar la inspeccion.";
          })();
          setStatusMessage(message);
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <div className="grid-two">
        <label className="field">
          <span>Placa</span>
          <select
            className="select-field"
            onChange={(event) => setPlate(event.target.value)}
            value={plate}
          >
            {vehicles.map((vehicle) => (
              <option key={vehicle.placa} value={vehicle.placa}>
                {vehicle.placa} - {vehicle.tipoVehiculo}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Kilometraje</span>
          <input
            inputMode="numeric"
            onChange={(event) => setKilometraje(event.target.value)}
            placeholder="Ej: 128999"
            type="text"
            value={kilometraje}
          />
        </label>
      </div>

      <label className="field">
        <span>Conductor</span>
        <select
          className="select-field"
          disabled={currentUser?.rol === "conductor"}
          onChange={(event) => setDriverDocument(event.target.value)}
          value={driverDocument}
        >
          {driverOptions.map((driver) => (
            <option key={driver.documento} value={driver.documento}>
              {driver.nombreCompleto}
            </option>
          ))}
        </select>
      </label>

      <section className="stack-md">
        <div>
          <h2>Checklist</h2>
          <p className="muted">
            Los items criticos deben bloquear el FUEC si quedan en estado no
            aceptable.
          </p>
          <p className="validation-code">Resultado actual: {currentResult}</p>
        </div>

        {checklistItems.map((item) => (
          <article className="check-item" key={item.codigo}>
            <div className="check-item__header">
              <div>
                <h3>{item.nombre}</h3>
                <p className="muted">
                  {item.critico ? "Item critico" : "Item general"}
                </p>
              </div>
            </div>

            {item.tipo === "estado" ? (
              <div className="option-row">
                {item.opciones?.map((option) => (
                  <label className="option-pill" key={option}>
                    <input
                      defaultChecked={option === "Bueno"}
                      name={item.codigo}
                      onChange={(event) =>
                        setItemValues((current) => ({
                          ...current,
                          [item.codigo]: event.target.value
                        }))
                      }
                      type="radio"
                      value={option}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : item.tipo === "enumlist" ? (
              <div className="enum-grid">
                {item.opciones?.map((option) => {
                  const selectedValues = itemValues[item.codigo]
                    ? itemValues[item.codigo].split(" | ").filter(Boolean)
                    : [];
                  const checked = selectedValues.includes(option);

                  return (
                    <label className="check-option" key={option}>
                      <input
                        checked={checked}
                        onChange={() => toggleEnumListValue(item.codigo, option)}
                        type="checkbox"
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <textarea
                className="text-area"
                onChange={(event) =>
                  setItemValues((current) => ({
                    ...current,
                    [item.codigo]: event.target.value
                  }))
                }
                placeholder="Digite el detalle"
                rows={item.tipo === "texto_largo" ? 3 : 2}
              />
            )}
          </article>
        ))}
      </section>

      <section className="stack-md">
        <div>
          <h2>Evidencias obligatorias</h2>
          <p className="muted">
            El formulario no debe cerrarse si falta alguna evidencia.
          </p>
        </div>

        <div className="evidence-grid">
          {requiredEvidence
            .filter((evidence) => evidence.codigo !== "FIRMA_CONDUCTOR")
            .map((evidence) => (
            <article className="evidence-card" key={evidence.codigo}>
              <h3>{evidence.nombre}</h3>
              <p className="muted">Carga desde camara o galeria</p>
              <label className="secondary-button file-button">
                Adjuntar archivo
                <input
                  accept="image/*"
                  className="file-input"
                  onChange={(event) =>
                    setEvidenceValues((current) => ({
                      ...current,
                      [evidence.codigo]: event.target.files?.[0]
                        ? {
                            fileName: event.target.files[0].name,
                            file: event.target.files[0]
                          }
                        : current[evidence.codigo]
                    }))
                  }
                  type="file"
                />
              </label>
              <p className="muted evidence-name">
                {evidenceValues[evidence.codigo]?.fileName ?? "Sin archivo cargado"}
              </p>
            </article>
          ))}
        </div>

        <article className="evidence-card">
          <h3>Firma del conductor</h3>
          <p className="muted">
            El conductor puede firmar directamente en pantalla desde su celular.
          </p>
          <SignaturePad
            onChange={(value) =>
              setEvidenceValues((current) => ({
                ...current,
                FIRMA_CONDUCTOR: {
                  fileName: "firma-conductor.png",
                  dataUrl: value
                }
              }))
            }
          />
          <p className="muted evidence-name">
            {evidenceValues.FIRMA_CONDUCTOR
              ? "Firma registrada correctamente"
              : "Aun no hay firma"}
          </p>
        </article>
      </section>

      <label className="field">
        <span>Observaciones</span>
        <textarea
          className="text-area"
          onChange={(event) => setObservaciones(event.target.value)}
          placeholder="Registre novedades relevantes"
          rows={4}
          value={observaciones}
        />
      </label>

      <div className="action-row">
        <button className="secondary-button" type="button">
          Guardar borrador
        </button>
        <button className="primary-button" type="submit">
          {isSubmitting ? "Guardando inspeccion..." : "Cerrar inspeccion y generar PDF"}
        </button>
      </div>

      {statusMessage ? <p className="muted">{statusMessage}</p> : null}
    </form>
  );
}
