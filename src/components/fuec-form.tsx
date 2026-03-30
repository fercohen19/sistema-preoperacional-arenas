"use client";

import { useEffect, useMemo, useState } from "react";
import { contractRecords, findContractByNumber } from "@/lib/contracts";
import { useCurrentAppUser } from "@/lib/current-user";
import { buildValidationUrl } from "@/lib/document-utils";
import { saveFuec } from "@/lib/fuec";
import { mockDrivers, mockVehicles } from "@/lib/mock-data";
import { supabase } from "@/lib/supabase";

type FuecVehicleOption = {
  placa: string;
  tipoVehiculo: string;
};

type FuecDriverOption = {
  documento: string;
  nombreCompleto: string;
  numeroLicencia: string;
  vigenciaLicencia: string;
};

function getLicenseAlert(vigenciaLicencia: string) {
  if (!vigenciaLicencia) {
    return null;
  }

  const today = new Date();
  const expiry = new Date(`${vigenciaLicencia}T00:00:00`);

  if (Number.isNaN(expiry.getTime())) {
    return null;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expiryStart = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const daysUntilExpiry = Math.ceil((expiryStart.getTime() - todayStart.getTime()) / msPerDay);

  if (daysUntilExpiry < 0) {
    return {
      tone: "danger",
      text: `Licencia vencida hace ${Math.abs(daysUntilExpiry)} dia(s).`
    };
  }

  if (daysUntilExpiry <= 60) {
    return {
      tone: "warning",
      text: `La licencia vence en ${daysUntilExpiry} dia(s).`
    };
  }

  return {
    tone: "ok",
    text: `Licencia vigente. Restan ${daysUntilExpiry} dia(s).`
  };
}

function isLicenseExpired(vigenciaLicencia: string) {
  const alert = getLicenseAlert(vigenciaLicencia);
  return alert?.tone === "danger";
}

export function FuecForm() {
  const [vehicles, setVehicles] = useState<FuecVehicleOption[]>(mockVehicles);
  const [drivers, setDrivers] = useState<FuecDriverOption[]>(
    mockDrivers.map((driver) => ({
      documento: driver.documento,
      nombreCompleto: driver.nombreCompleto,
      numeroLicencia: "",
      vigenciaLicencia: ""
    }))
  );
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plate, setPlate] = useState(mockVehicles[0]?.placa ?? "");
  const [driverDocument, setDriverDocument] = useState(mockDrivers[0]?.documento ?? "");
  const [contractReference, setContractReference] = useState(
    contractRecords[0]?.numeroContrato ?? ""
  );
  const [serviceDate, setServiceDate] = useState("");
  const [observations, setObservations] = useState("");
  const [previewCode, setPreviewCode] = useState("FUEC-2026-000001");
  const { user: currentUser } = useCurrentAppUser();
  const selectedContract = useMemo(
    () => findContractByNumber(contractReference),
    [contractReference]
  );
  const driverOptions = useMemo(() => {
    if (currentUser?.rol === "conductor" && currentUser.documento) {
      return drivers.filter((driver) => driver.documento === currentUser.documento);
    }

    return drivers;
  }, [currentUser, drivers]);
  const selectedDriver = useMemo(
    () => driverOptions.find((driver) => driver.documento === driverDocument) ?? null,
    [driverDocument, driverOptions]
  );
  const licenseAlert = useMemo(
    () => getLicenseAlert(selectedDriver?.vigenciaLicencia ?? ""),
    [selectedDriver]
  );

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
            .select("documento, nombre_completo, numero_licencia, vigencia_licencia, estado")
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
          nombreCompleto: driver.nombre_completo,
          numeroLicencia: driver.numero_licencia ?? "",
          vigenciaLicencia: driver.vigencia_licencia ?? ""
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

  return (
    <form
      className="stack-lg"
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage("");

        if (!contractReference || !serviceDate) {
          setMessage("Completa el contrato y la fecha de servicio.");
          return;
        }

        if (isLicenseExpired(selectedDriver?.vigenciaLicencia ?? "")) {
          setMessage("No es posible emitir el FUEC porque la licencia del conductor esta vencida.");
          return;
        }

        try {
          setIsSubmitting(true);
          const saved = await saveFuec({
            placa: plate,
            conductorDocumento: driverDocument,
            contratoReferencia: contractReference,
            origen: selectedContract?.lugarRecogida ?? "",
            destino: selectedContract?.detalleRecorrido ?? "",
            fechaServicio: serviceDate,
            observaciones: observations
          });

          setPreviewCode(saved.consecutivo);
          setMessage(
            `FUEC emitido con consecutivo ${saved.consecutivo}. PDF generado y vinculado al preoperacional ${saved.inspectionCode}.`
          );
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "No fue posible emitir el FUEC."
          );
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <div className="grid-two two-columns">
        <label className="field">
          <span>Vehiculo</span>
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
      </div>

      <div className="grid-two two-columns">
        <label className="field">
          <span>Documento del conductor</span>
          <input
            readOnly
            type="text"
            value={selectedDriver?.documento ?? ""}
          />
        </label>
        <label className="field">
          <span>No. licencia</span>
          <input
            readOnly
            type="text"
            value={selectedDriver?.numeroLicencia || "PENDIENTE"}
          />
        </label>
      </div>

      <label className="field">
        <span>Vigencia de la licencia</span>
        <input
          readOnly
          type="text"
          value={selectedDriver?.vigenciaLicencia || "PENDIENTE"}
        />
        {licenseAlert ? (
          <small
            className="muted"
            style={{
              color:
                licenseAlert.tone === "danger"
                  ? "#b42318"
                  : licenseAlert.tone === "warning"
                    ? "#b54708"
                    : "#067647",
              fontWeight: 600
            }}
          >
            {licenseAlert.text}
          </small>
        ) : selectedDriver?.vigenciaLicencia ? null : (
          <small style={{ color: "#b42318", fontWeight: 600 }}>
            Falta registrar la vigencia de la licencia.
          </small>
        )}
      </label>

      <div className="grid-two two-columns">
        <label className="field">
          <span>Contrato referencia</span>
          <select
            className="select-field"
            onChange={(event) => setContractReference(event.target.value)}
            value={contractReference}
          >
            {contractRecords.map((contract) => (
              <option key={contract.numeroContrato} value={contract.numeroContrato}>
                {contract.numeroContrato} - {contract.nombreSuscritoContrato}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Fecha del servicio</span>
          <input
            onChange={(event) => setServiceDate(event.target.value)}
            type="date"
            value={serviceDate}
          />
        </label>
      </div>

      <div className="grid-two two-columns">
        <label className="field">
          <span>Contratante</span>
          <input
            readOnly
            type="text"
            value={selectedContract?.nombreSuscritoContrato ?? ""}
          />
        </label>
        <label className="field">
          <span>Documento contratante</span>
          <input
            readOnly
            type="text"
            value={selectedContract?.documentoContratante ?? ""}
          />
        </label>
      </div>

      <div className="grid-two two-columns">
        <label className="field">
          <span>Lugar de recogida</span>
          <input
            readOnly
            type="text"
            value={selectedContract?.lugarRecogida ?? ""}
          />
        </label>
        <label className="field">
          <span>Detalle del recorrido</span>
          <textarea
            className="text-area"
            readOnly
            rows={3}
            value={selectedContract?.detalleRecorrido ?? ""}
          />
        </label>
      </div>

      <div className="grid-two two-columns">
        <label className="field">
          <span>Personas a transportar</span>
          <input
            readOnly
            type="text"
            value={selectedContract?.personasTransportadas ?? ""}
          />
        </label>
        <label className="field">
          <span>Valor del contrato</span>
          <input
            readOnly
            type="text"
            value={selectedContract?.valorContrato ?? ""}
          />
        </label>
      </div>

      <label className="field">
        <span>Correo / telefono responsable</span>
        <input
          readOnly
          type="text"
          value={
            selectedContract
              ? `${selectedContract.correo} / ${selectedContract.telefono}`
              : ""
          }
        />
      </label>

      <label className="field">
        <span>Direccion del responsable</span>
        <input
          readOnly
          type="text"
          value={selectedContract?.direccion ?? ""}
        />
      </label>

      <div className="grid-two two-columns">
        <label className="field">
          <span>Origen usado para el FUEC</span>
          <input
            readOnly
            type="text"
            value={selectedContract?.lugarRecogida ?? ""}
          />
        </label>
        <label className="field">
          <span>Destino usado para el FUEC</span>
          <input
            readOnly
            type="text"
            value={selectedContract?.detalleRecorrido ?? ""}
          />
        </label>
      </div>

      <label className="field">
        <span>Observaciones</span>
        <textarea
          className="text-area"
          onChange={(event) => setObservations(event.target.value)}
          placeholder="Observaciones del servicio"
          rows={3}
          value={observations}
        />
      </label>

      <article className="check-item">
        <p className="eyebrow">Validaciones previas</p>
        <div className="stack-md">
          <p className="muted">
            El sistema debe revisar preoperacional vigente, estado del vehiculo
            y estado del conductor antes de liberar el consecutivo.
          </p>
          <div className="table-list">
            <div className="table-row compact">
              <strong>Preoperacional del dia</strong>
              <span className="status-pill">Se valida al emitir</span>
            </div>
            <div className="table-row compact">
              <strong>Vehiculo activo</strong>
              <span className="status-pill">Se valida al emitir</span>
            </div>
            <div className="table-row compact">
              <strong>Conductor activo</strong>
              <span className="status-pill">Se valida al emitir</span>
            </div>
          </div>
        </div>
      </article>

      <article className="check-item">
        <p className="eyebrow">Documento</p>
        <div className="stack-md">
          <p className="validation-code">{previewCode}</p>
          <p className="muted">URL QR: {buildValidationUrl(previewCode)}</p>
        </div>
      </article>

      <div className="action-row">
        <button className="secondary-button" type="button">
          Guardar borrador FUEC
        </button>
        <button
          className="primary-button"
          disabled={isSubmitting || isLicenseExpired(selectedDriver?.vigenciaLicencia ?? "")}
          type="submit"
        >
          {isSubmitting ? "Emitiendo FUEC..." : "Generar FUEC y PDF"}
        </button>
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
