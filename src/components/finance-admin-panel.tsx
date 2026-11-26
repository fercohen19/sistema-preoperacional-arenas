"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXPENSE_CATEGORIES, parseCostSheet, type ImportedExpense, type ImportedService } from "@/lib/finance-import";
import {
  addDays,
  directCosts,
  FINANCE_COLUMNS,
  formatCOP,
  formatShortDate,
  friendlyDbError,
  loadFinancesFor,
  moneyInput,
  normalizeFinance,
  parseMoney,
  SERVICE_COLUMNS,
  SERVICE_STATUS_LABEL,
  todayBogota,
  type PaymentStatus,
  type ServiceFinanceRecord,
  type ServiceRecord
} from "@/lib/services";
import { supabase } from "@/lib/supabase";
import { MoneyField } from "./services-admin-panel";
import { StatusPill } from "./status-pill";

type Tab = "resumen" | "servicios" | "gastos" | "vehiculos";

type Expense = {
  id: string;
  fecha: string;
  hora: string | null;
  categoria: string;
  descripcion: string;
  valor: number;
  vehiculo_id: string | null;
  conductor_id: string | null;
  servicio_id: string | null;
  proveedor: string | null;
  galones: number | null;
  kilometraje: number | null;
  metodo_pago: string | null;
  soporte: string | null;
};

type Maintenance = { id: string; fecha: string; vehiculo_id: string; tipo: string; asunto: string; costo: number | null };

const EXPENSE_COLUMNS =
  "id, fecha, hora, categoria, descripcion, valor, vehiculo_id, conductor_id, servicio_id, proveedor, galones, kilometraje, metodo_pago, soporte";

type ExpenseDraft = {
  id: string;
  fecha: string;
  hora: string;
  categoria: string;
  descripcion: string;
  valor: string;
  vehiculo_id: string;
  conductor_id: string;
  proveedor: string;
  galones: string;
  kilometraje: string;
  metodo_pago: string;
  soporte: string;
};

const emptyExpense = (fecha: string): ExpenseDraft => ({
  id: "",
  fecha,
  hora: "",
  categoria: "COMBUSTIBLE",
  descripcion: "Tanqueo ACPM",
  valor: "",
  vehiculo_id: "",
  conductor_id: "",
  proveedor: "",
  galones: "",
  kilometraje: "",
  metodo_pago: "",
  soporte: ""
});

function monthRange(isoDate: string) {
  const [y, m] = isoDate.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function FinanceAdminPanel() {
  const today = todayBogota();
  const [tab, setTab] = useState<Tab>("resumen");
  const [desde, setDesde] = useState(() => monthRange(today).start);
  const [hasta, setHasta] = useState(() => monthRange(today).end);
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [finances, setFinances] = useState<Record<string, ServiceFinanceRecord>>({});
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [drivers, setDrivers] = useState<Array<{ id: string; nombre_completo: string }>>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; placa: string }>>([]);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editingService, setEditingService] = useState<ServiceRecord | null>(null);
  const [serviceDraft, setServiceDraft] = useState({ valor: "", costo_conductor: "", peajes_cantidad: "", costo_peajes: "", otros_costos: "", estado_pago: "PENDIENTE" as PaymentStatus, factura_numero: "", notas: "" });
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [importData, setImportData] = useState<{ services: ImportedService[]; expenses: ImportedExpense[]; warnings: string[]; fileName: string } | null>(null);
  const [importDate, setImportDate] = useState(today);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setMessage({ tone: "danger", text: "Supabase no esta configurado." });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [s, g, m, d, v] = await Promise.all([
      supabase.from("servicios").select(SERVICE_COLUMNS).gte("fecha", desde).lte("fecha", hasta).order("fecha").order("hora_inicio"),
      supabase.from("gastos_operacion").select(EXPENSE_COLUMNS).gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }),
      supabase.from("mantenimientos_vehiculo").select("id, fecha, vehiculo_id, tipo, asunto, costo").gte("fecha", desde).lte("fecha", hasta),
      supabase.from("conductores").select("id, nombre_completo").order("nombre_completo"),
      supabase.from("vehiculos").select("id, placa").order("placa")
    ]);
    const error = s.error ?? g.error;
    if (error) setMessage({ tone: "danger", text: friendlyDbError(error.message).replace("2026-11-25_modulo_servicios_y_rutas.sql", "las migraciones del 25 y 26 de noviembre") });
    const serviceRows = (s.data ?? []) as ServiceRecord[];
    setServices(serviceRows);
    setFinances(await loadFinancesFor(serviceRows.map((row) => row.id)));
    setExpenses(((g.data ?? []) as Expense[]).map((row) => ({ ...row, valor: Number(row.valor) })));
    setMaintenances(((m.data ?? []) as Maintenance[]).map((row) => ({ ...row, costo: row.costo === null ? null : Number(row.costo) })));
    setDrivers((d.data ?? []) as Array<{ id: string; nombre_completo: string }>);
    setVehicles((v.data ?? []) as Array<{ id: string; placa: string }>);
    setIsLoading(false);
  }, [desde, hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  const plate = useCallback((id: string | null) => vehicles.find((row) => row.id === id)?.placa ?? "", [vehicles]);
  const driverName = useCallback((id: string | null) => drivers.find((row) => row.id === id)?.nombre_completo ?? "", [drivers]);

  const activeServices = useMemo(
    () => services.filter((row) => row.estado !== "CANCELADO" && (!vehicleFilter || row.vehiculo_id === vehicleFilter)),
    [services, vehicleFilter]
  );
  const filteredExpenses = useMemo(() => expenses.filter((row) => !vehicleFilter || row.vehiculo_id === vehicleFilter), [expenses, vehicleFilter]);
  const filteredMaintenances = useMemo(
    () => maintenances.filter((row) => row.costo && (!vehicleFilter || row.vehiculo_id === vehicleFilter)),
    [maintenances, vehicleFilter]
  );

  const totals = useMemo(() => {
    const ingresos = activeServices.reduce((sum, row) => sum + (finances[row.id]?.valor_servicio ?? 0), 0);
    const conductores = activeServices.reduce((sum, row) => sum + (finances[row.id]?.costo_conductor ?? 0), 0);
    const peajes = activeServices.reduce((sum, row) => sum + (finances[row.id]?.costo_peajes ?? 0), 0);
    const otrosServicio = activeServices.reduce((sum, row) => sum + (finances[row.id]?.otros_costos ?? 0), 0);
    const gastos = filteredExpenses.reduce((sum, row) => sum + row.valor, 0);
    const mantenimiento = filteredMaintenances.reduce((sum, row) => sum + (row.costo ?? 0), 0);
    const porCobrar = activeServices
      .filter((row) => (finances[row.id]?.estado_pago ?? "PENDIENTE") === "PENDIENTE")
      .reduce((sum, row) => sum + (finances[row.id]?.valor_servicio ?? 0), 0);
    const sinValor = activeServices.filter((row) => !finances[row.id]?.valor_servicio).length;
    const costosTotales = conductores + peajes + otrosServicio + gastos + mantenimiento;
    return { ingresos, conductores, peajes, otrosServicio, gastos, mantenimiento, porCobrar, sinValor, costosTotales, utilidad: ingresos - costosTotales };
  }, [activeServices, filteredExpenses, filteredMaintenances, finances]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    map.set("Conductores (servicios)", totals.conductores);
    map.set("Peajes (servicios)", totals.peajes);
    if (totals.otrosServicio) map.set("Otros costos de servicios", totals.otrosServicio);
    filteredExpenses.forEach((row) => {
      const label = EXPENSE_CATEGORIES[row.categoria] ?? row.categoria;
      map.set(label, (map.get(label) ?? 0) + row.valor);
    });
    if (totals.mantenimiento) map.set("Mantenimiento (hoja de vida)", (map.get("Mantenimiento (hoja de vida)") ?? 0) + totals.mantenimiento);
    return [...map.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses, totals]);

  const byVehicle = useMemo(() => {
    const rows = new Map<string, { placa: string; servicios: number; ingresos: number; directos: number; combustible: number; mantenimiento: number; otros: number }>();
    const get = (id: string | null) => {
      const key = id ?? "SIN";
      if (!rows.has(key)) rows.set(key, { placa: id ? plate(id) || "?" : "Sin vehiculo", servicios: 0, ingresos: 0, directos: 0, combustible: 0, mantenimiento: 0, otros: 0 });
      return rows.get(key)!;
    };
    activeServices.forEach((row) => {
      const entry = get(row.vehiculo_id);
      entry.servicios += 1;
      entry.ingresos += finances[row.id]?.valor_servicio ?? 0;
      entry.directos += directCosts(finances[row.id]);
    });
    filteredExpenses.forEach((row) => {
      const entry = get(row.vehiculo_id);
      if (row.categoria === "COMBUSTIBLE") entry.combustible += row.valor;
      else if (row.categoria === "MANTENIMIENTO") entry.mantenimiento += row.valor;
      else entry.otros += row.valor;
    });
    filteredMaintenances.forEach((row) => {
      get(row.vehiculo_id).mantenimiento += row.costo ?? 0;
    });
    return [...rows.values()]
      .map((row) => ({ ...row, utilidad: row.ingresos - row.directos - row.combustible - row.mantenimiento - row.otros }))
      .sort((a, b) => b.ingresos - a.ingresos);
  }, [activeServices, filteredExpenses, filteredMaintenances, finances, plate]);

  const openService = (service: ServiceRecord) => {
    const finance = finances[service.id];
    setEditingService(service);
    setServiceDraft({
      valor: moneyInput(finance?.valor_servicio ?? 0),
      costo_conductor: moneyInput(finance?.costo_conductor ?? 0),
      peajes_cantidad: finance?.peajes_cantidad ? String(finance.peajes_cantidad) : "",
      costo_peajes: moneyInput(finance?.costo_peajes ?? 0),
      otros_costos: moneyInput(finance?.otros_costos ?? 0),
      estado_pago: finance?.estado_pago ?? "PENDIENTE",
      factura_numero: finance?.factura_numero ?? "",
      notas: finance?.notas ?? ""
    });
  };

  const saveServiceFinance = async () => {
    if (!supabase || !editingService) return;
    setBusy(true);
    const row = {
      servicio_id: editingService.id,
      valor_servicio: parseMoney(serviceDraft.valor),
      costo_conductor: parseMoney(serviceDraft.costo_conductor),
      peajes_cantidad: Number(serviceDraft.peajes_cantidad) || 0,
      costo_peajes: parseMoney(serviceDraft.costo_peajes),
      otros_costos: parseMoney(serviceDraft.otros_costos),
      estado_pago: serviceDraft.estado_pago,
      fecha_pago: serviceDraft.estado_pago === "PAGADO" ? finances[editingService.id]?.fecha_pago ?? today : null,
      factura_numero: serviceDraft.factura_numero.trim() || null,
      notas: serviceDraft.notas.trim() || null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from("servicio_finanzas").upsert(row).select(FINANCE_COLUMNS).single();
    setBusy(false);
    if (error || !data) {
      setMessage({ tone: "danger", text: friendlyDbError(error?.message) });
      return;
    }
    setFinances((current) => ({ ...current, [editingService.id]: normalizeFinance(data as ServiceFinanceRecord) }));
    setEditingService(null);
    setMessage({ tone: "ok", text: "Valores del servicio guardados." });
  };

  const saveExpense = async () => {
    if (!supabase || !expenseDraft) return;
    const valor = parseMoney(expenseDraft.valor);
    if (!expenseDraft.fecha || !valor || !expenseDraft.descripcion.trim()) {
      setMessage({ tone: "danger", text: "Fecha, descripcion y valor son obligatorios." });
      return;
    }
    setBusy(true);
    const row = {
      fecha: expenseDraft.fecha,
      hora: expenseDraft.hora || null,
      categoria: expenseDraft.categoria,
      descripcion: expenseDraft.descripcion.trim().slice(0, 250),
      valor,
      vehiculo_id: expenseDraft.vehiculo_id || null,
      conductor_id: expenseDraft.conductor_id || null,
      proveedor: expenseDraft.proveedor.trim() || null,
      galones: expenseDraft.galones ? Number(expenseDraft.galones.replace(",", ".")) : null,
      kilometraje: expenseDraft.kilometraje ? Number(expenseDraft.kilometraje.replace(/\D/g, "")) : null,
      metodo_pago: expenseDraft.metodo_pago || null,
      soporte: expenseDraft.soporte.trim() || null,
      updated_at: new Date().toISOString()
    };
    const { error } = expenseDraft.id
      ? await supabase.from("gastos_operacion").update(row).eq("id", expenseDraft.id)
      : await supabase.from("gastos_operacion").insert(row);
    setBusy(false);
    if (error) {
      setMessage({ tone: "danger", text: friendlyDbError(error.message) });
      return;
    }
    setExpenseDraft(null);
    setMessage({ tone: "ok", text: expenseDraft.id ? "Gasto actualizado." : "Gasto registrado." });
    await load();
  };

  const deleteExpense = async (id: string) => {
    if (!supabase || !window.confirm("Eliminar este gasto?")) return;
    const { error } = await supabase.from("gastos_operacion").delete().eq("id", id);
    if (error) setMessage({ tone: "danger", text: friendlyDbError(error.message) });
    else {
      setExpenseDraft(null);
      await load();
    }
  };

  const readSheet = async (file: File) => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    const parsed = parseCostSheet(rows);
    setImportData({ ...parsed, fileName: file.name });
    if (!parsed.services.length && !parsed.expenses.length) {
      setMessage({ tone: "warn", text: "No se reconocieron servicios ni gastos en la primera hoja del archivo." });
    }
  };

  const runImport = async () => {
    if (!supabase || !importData) return;
    setBusy(true);
    const plateId = (value: string) => vehicles.find((row) => row.placa === value)?.id ?? null;
    let servicesOk = 0;
    let expensesOk = 0;
    const errors: string[] = [];

    for (const item of importData.services) {
      const { data, error } = await supabase
        .from("servicios")
        .insert({
          fecha: item.fecha ?? importDate,
          hora_inicio: "08:00",
          titulo: item.titulo,
          vehiculo_id: plateId(item.placa),
          estado: "COMPLETADO",
          origen_registro: "MANUAL",
          descripcion: `Importado de ${importData.fileName} (fila ${item.fila})`
        })
        .select("id")
        .single();
      if (error || !data) {
        errors.push(`Fila ${item.fila}: ${friendlyDbError(error?.message)}`);
        continue;
      }
      const finance = await supabase.from("servicio_finanzas").insert({
        servicio_id: data.id,
        valor_servicio: item.valor,
        costo_conductor: item.costoConductor,
        peajes_cantidad: item.peajesCantidad,
        notas: item.peajesDetalle ? `Peajes: ${item.peajesDetalle}` : null
      });
      if (finance.error) errors.push(`Fila ${item.fila}: ${friendlyDbError(finance.error.message)}`);
      else servicesOk += 1;
    }

    if (importData.expenses.length) {
      const rows = importData.expenses.map((item) => ({
        fecha: item.fecha || importDate,
        hora: item.hora,
        categoria: item.categoria,
        descripcion: item.descripcion,
        valor: item.valor,
        vehiculo_id: plateId(item.placa),
        soporte: `Importado de ${importData.fileName} (fila ${item.fila})`
      }));
      const { error } = await supabase.from("gastos_operacion").insert(rows);
      if (error) errors.push(`Gastos: ${friendlyDbError(error.message)}`);
      else expensesOk = rows.length;
    }

    setBusy(false);
    setImportData(null);
    setMessage({
      tone: errors.length ? "warn" : "ok",
      text: `Importados ${servicesOk} servicio(s) y ${expensesOk} gasto(s).${errors.length ? ` Errores: ${errors.slice(0, 3).join(" | ")}` : ""} Revisa el rango de fechas para verlos.`
    });
    await load();
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const resumen = [
      ["ARENAS Transporte y Turismo - Relacion de costos y gastos"],
      [`Periodo: ${desde} a ${hasta}${vehicleFilter ? ` · Vehiculo ${plate(vehicleFilter)}` : ""}`],
      [],
      ["Concepto", "Valor"],
      ["Ingresos por servicios", totals.ingresos],
      ["Costo conductores + aux. transporte", totals.conductores],
      ["Peajes de servicios", totals.peajes],
      ["Otros costos de servicios", totals.otrosServicio],
      ["Gastos de operacion", totals.gastos],
      ["Mantenimientos (hoja de vida)", totals.mantenimiento],
      ["Total costos y gastos", totals.costosTotales],
      ["Utilidad", totals.utilidad],
      ["Margen %", totals.ingresos ? Math.round((totals.utilidad / totals.ingresos) * 1000) / 10 : 0],
      ["Por cobrar", totals.porCobrar],
      [],
      ["Gasto por categoria", "Valor"],
      ...byCategory.map(([label, value]) => [label, value])
    ];
    const resumenSheet = XLSX.utils.aoa_to_sheet(resumen);
    resumenSheet["!cols"] = [{ wch: 42 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, resumenSheet, "Resumen");

    const serviceRows = activeServices.map((row) => {
      const finance = finances[row.id];
      return {
        Fecha: row.fecha,
        Hora: row.hora_inicio.slice(0, 5),
        Servicio: row.titulo,
        Cliente: row.cliente ?? "",
        Contrato: row.contrato_referencia ?? "",
        Conductor: driverName(row.conductor_id),
        Placa: plate(row.vehiculo_id),
        Estado: SERVICE_STATUS_LABEL[row.estado],
        Valor: finance?.valor_servicio ?? 0,
        "Conductor + aux. transporte": finance?.costo_conductor ?? 0,
        "Cant. peajes": finance?.peajes_cantidad ?? 0,
        Peajes: finance?.costo_peajes ?? 0,
        "Otros costos": finance?.otros_costos ?? 0,
        Margen: (finance?.valor_servicio ?? 0) - directCosts(finance),
        "Estado de pago": finance?.estado_pago ?? "PENDIENTE",
        Factura: finance?.factura_numero ?? "",
        Notas: finance?.notas ?? ""
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(serviceRows), "Servicios");

    const expenseRows = filteredExpenses.map((row) => ({
      Fecha: row.fecha,
      Hora: row.hora?.slice(0, 5) ?? "",
      Categoria: EXPENSE_CATEGORIES[row.categoria] ?? row.categoria,
      Descripcion: row.descripcion,
      Valor: row.valor,
      Placa: plate(row.vehiculo_id),
      Conductor: driverName(row.conductor_id),
      Proveedor: row.proveedor ?? "",
      Galones: row.galones ?? "",
      Kilometraje: row.kilometraje ?? "",
      "Metodo de pago": row.metodo_pago ?? "",
      Soporte: row.soporte ?? ""
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expenseRows.length ? expenseRows : [{ Fecha: "", Valor: "" }]), "Gastos");

    const maintenanceRows = filteredMaintenances.map((row) => ({
      Fecha: row.fecha,
      Placa: plate(row.vehiculo_id),
      Tipo: row.tipo,
      Asunto: row.asunto,
      Costo: row.costo ?? 0
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(maintenanceRows.length ? maintenanceRows : [{ Fecha: "", Costo: "" }]), "Mantenimientos");

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        byVehicle.map((row) => ({
          Placa: row.placa,
          Servicios: row.servicios,
          Ingresos: row.ingresos,
          "Costos directos": row.directos,
          Combustible: row.combustible,
          Mantenimiento: row.mantenimiento,
          "Otros gastos": row.otros,
          Utilidad: row.utilidad
        }))
      ),
      "Por vehiculo"
    );

    const byDriver = new Map<string, { Conductor: string; Servicios: number; Ingresos: number; "Pago conductor": number }>();
    activeServices.forEach((row) => {
      const key = row.conductor_id ?? "SIN";
      const entry = byDriver.get(key) ?? { Conductor: driverName(row.conductor_id) || "Sin asignar", Servicios: 0, Ingresos: 0, "Pago conductor": 0 };
      entry.Servicios += 1;
      entry.Ingresos += finances[row.id]?.valor_servicio ?? 0;
      entry["Pago conductor"] += finances[row.id]?.costo_conductor ?? 0;
      byDriver.set(key, entry);
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([...byDriver.values()]), "Por conductor");

    XLSX.writeFile(workbook, `arenas-costos-gastos-${desde}-a-${hasta}.xlsx`);
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Fecha", "Categoria", "Descripcion", "Valor", "Placa"],
      ["2026-11-24 10:30", "Combustible", "Tanqueo ACPM", 193706, "WMK123"],
      ["2026-11-24", "Peajes", "Peaje Puerto Colombia", 12500, "WMK123"],
      ["2026-11-25", "Lavado", "Lavado general", 35000, ""]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Gastos");
    XLSX.writeFile(workbook, "plantilla-gastos-arenas.xlsx");
  };

  const visibleServiceRows = activeServices.filter((row) => !onlyMissing || !finances[row.id]?.valor_servicio);
  const maxCategory = byCategory[0]?.[1] ?? 1;
  const margin = totals.ingresos ? (totals.utilidad / totals.ingresos) * 100 : 0;

  return (
    <div className="stack-lg">
      <div className="toolbar">
        <label className="field">
          <span>Desde</span>
          <input onChange={(event) => setDesde(event.target.value)} type="date" value={desde} />
        </label>
        <label className="field">
          <span>Hasta</span>
          <input onChange={(event) => setHasta(event.target.value)} type="date" value={hasta} />
        </label>
        <div className="field">
          <span>Periodo rapido</span>
          <div className="action-row">
            <button className="ghost-button small-button" onClick={() => { const r = monthRange(today); setDesde(r.start); setHasta(r.end); }} type="button">
              Este mes
            </button>
            <button
              className="ghost-button small-button"
              onClick={() => {
                const r = monthRange(addDays(monthRange(today).start, -1));
                setDesde(r.start);
                setHasta(r.end);
              }}
              type="button"
            >
              Mes anterior
            </button>
            <button className="ghost-button small-button" onClick={() => { setDesde(`${today.slice(0, 4)}-01-01`); setHasta(`${today.slice(0, 4)}-12-31`); }} type="button">
              Ano
            </button>
          </div>
        </div>
        <label className="field">
          <span>Vehiculo</span>
          <select className="select-field" onChange={(event) => setVehicleFilter(event.target.value)} value={vehicleFilter}>
            <option value="">Todos</option>
            {vehicles.map((row) => (
              <option key={row.id} value={row.id}>
                {row.placa}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button className="accent-button primary-button" onClick={() => void exportExcel()} type="button">
          ⬇ Exportar Excel
        </button>
      </div>

      {message ? (
        <p className={`admin-alert ${message.tone === "danger" ? "admin-alert--danger" : message.tone === "warn" ? "admin-alert--warn" : ""}`}>{message.text}</p>
      ) : null}

      <div className="stats-grid">
        <article className="stat-card">
          <p className="eyebrow">Ingresos</p>
          <p className="stat-value">{formatCOP(totals.ingresos)}</p>
          <p className="muted">{activeServices.length} servicios{totals.sinValor ? ` · ${totals.sinValor} sin valor` : ""}</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Costos y gastos</p>
          <p className="stat-value">{formatCOP(totals.costosTotales)}</p>
          <p className="muted">Conductores, peajes, combustible y otros</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Utilidad</p>
          <p className={`stat-value ${totals.utilidad < 0 ? "negative" : ""}`}>{formatCOP(totals.utilidad)}</p>
          <p className="muted">Margen {margin.toFixed(1)}%</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Por cobrar</p>
          <p className="stat-value">{formatCOP(totals.porCobrar)}</p>
          <p className="muted">Servicios con pago pendiente</p>
        </article>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ["resumen", "Resumen"],
            ["servicios", `Servicios (${activeServices.length})`],
            ["gastos", `Gastos (${filteredExpenses.length})`],
            ["vehiculos", "Por vehiculo"]
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button className={tab === key ? "tab is-active" : "tab"} key={key} onClick={() => setTab(key)} type="button">
            {label}
          </button>
        ))}
      </div>

      {isLoading ? <p className="muted">Cargando informacion...</p> : null}

      {tab === "resumen" && !isLoading ? (
        <div className="grid-two two-columns">
          <article className="table-card stack-md">
            <div>
              <p className="eyebrow">Estado de resultados</p>
              <h2>Del {formatShortDate(desde)} al {formatShortDate(hasta)}</h2>
            </div>
            <table className="summary-table">
              <tbody>
                <tr><td>Ingresos por servicios</td><td className="num positive">{formatCOP(totals.ingresos)}</td></tr>
                <tr><td>Conductores + aux. transporte</td><td className="num">− {formatCOP(totals.conductores)}</td></tr>
                <tr><td>Peajes de servicios</td><td className="num">− {formatCOP(totals.peajes)}</td></tr>
                <tr><td>Otros costos de servicios</td><td className="num">− {formatCOP(totals.otrosServicio)}</td></tr>
                <tr><td>Gastos de operacion (combustible, lavado...)</td><td className="num">− {formatCOP(totals.gastos)}</td></tr>
                <tr><td>Mantenimientos con costo</td><td className="num">− {formatCOP(totals.mantenimiento)}</td></tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>Utilidad del periodo</td>
                  <td className={`num ${totals.utilidad < 0 ? "negative" : "positive"}`}>{formatCOP(totals.utilidad)}</td>
                </tr>
              </tfoot>
            </table>
          </article>
          <article className="table-card stack-md">
            <div>
              <p className="eyebrow">En que se va el dinero</p>
              <h2>Costos y gastos por categoria</h2>
            </div>
            {byCategory.length === 0 ? <p className="muted">Sin costos registrados en el periodo.</p> : null}
            <div className="bar-list">
              {byCategory.map(([label, value]) => (
                <div className="bar-list__row" key={label}>
                  <span>{label}</span>
                  <span className="bar-list__track">
                    <span style={{ width: `${(value / maxCategory) * 100}%` }} />
                  </span>
                  <span className="num">{formatCOP(value)}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="table-card stack-md" style={{ gridColumn: "1 / -1" }}>
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Traer lo que llevan por aparte</p>
                <h2>Importar hoja de costos (Excel o Google Sheets)</h2>
                <p className="muted">
                  Descarga la hoja como .xlsx (Archivo → Descargar → Microsoft Excel) y cargala. Se reconocen las columnas Descripcion,
                  Valor, Costo de conductor + Aux. Transporte, Peajes, Fecha de Tanqueo y Costo de ACPM. Tambien la plantilla de gastos del sistema.
                </p>
              </div>
              <div className="action-row">
                <button className="ghost-button small-button" onClick={() => void downloadTemplate()} type="button">
                  Plantilla de gastos
                </button>
                <button className="secondary-button small-button" onClick={() => fileRef.current?.click()} type="button">
                  Cargar archivo
                </button>
                <input
                  accept=".xlsx,.xls,.csv"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void readSheet(file);
                    event.target.value = "";
                  }}
                  ref={fileRef}
                  type="file"
                />
              </div>
            </div>
            {importData ? (
              <div className="stack-md">
                <div className="action-row">
                  <strong>{importData.fileName}:</strong>
                  <span>
                    {importData.services.length} servicio(s) por {formatCOP(importData.services.reduce((sum, row) => sum + row.valor, 0))} ·{" "}
                    {importData.expenses.length} gasto(s) por {formatCOP(importData.expenses.reduce((sum, row) => sum + row.valor, 0))}
                  </span>
                </div>
                {importData.services.some((row) => !row.fecha) || importData.expenses.some((row) => !row.fecha) ? (
                  <label className="field" style={{ maxWidth: 320 }}>
                    <span>Fecha para las filas sin fecha</span>
                    <input onChange={(event) => setImportDate(event.target.value)} type="date" value={importDate} />
                    <span className="field-hint">Tu hoja no trae fecha por servicio; se usara esta. Puedes ajustarla despues.</span>
                  </label>
                ) : null}
                {importData.warnings.length ? <p className="admin-alert admin-alert--warn">{importData.warnings.slice(0, 4).join(" ")}</p> : null}
                <div className="data-table-wrap">
                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>Tipo</th>
                        <th>Detalle</th>
                        <th>Fecha</th>
                        <th className="num">Valor</th>
                        <th className="num">Conductor</th>
                        <th>Peajes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importData.services.map((row) => (
                        <tr key={`s${row.fila}`}>
                          <td>{row.fila}</td>
                          <td><span className="status-pill status-pill--info">Servicio</span></td>
                          <td>{row.titulo}</td>
                          <td>{row.fecha ?? importDate}</td>
                          <td className="num">{formatCOP(row.valor)}</td>
                          <td className="num">{row.costoConductor ? formatCOP(row.costoConductor) : "-"}</td>
                          <td>{row.peajesDetalle || "-"}</td>
                        </tr>
                      ))}
                      {importData.expenses.map((row) => (
                        <tr key={`g${row.fila}`}>
                          <td>{row.fila}</td>
                          <td><span className="status-pill status-pill--warn">{EXPENSE_CATEGORIES[row.categoria]}</span></td>
                          <td>{row.descripcion}</td>
                          <td>{row.fecha || importDate}{row.hora ? ` ${row.hora}` : ""}</td>
                          <td className="num">{formatCOP(row.valor)}</td>
                          <td className="num">-</td>
                          <td>-</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="field-hint">
                  Los servicios entran como completados y sin conductor; el valor de cada peaje no viene en la hoja, solo la cantidad (queda en notas).
                </p>
                <div className="action-row">
                  <button className="primary-button" disabled={busy || (!importData.services.length && !importData.expenses.length)} onClick={() => void runImport()} type="button">
                    {busy ? "Importando..." : "Importar"}
                  </button>
                  <button className="ghost-button" onClick={() => setImportData(null)} type="button">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        </div>
      ) : null}

      {tab === "servicios" && !isLoading ? (
        <div className="stack-md">
          <div className="action-row">
            <label className="check-option">
              <input checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} type="checkbox" />
              Solo servicios sin valor ({totals.sinValor})
            </label>
            <span className="muted">Haz clic en un servicio para registrar su valor y costos.</span>
          </div>
          <div className="data-table-wrap">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Servicio</th>
                  <th>Conductor</th>
                  <th>Placa</th>
                  <th>Estado</th>
                  <th className="num">Valor</th>
                  <th className="num">Conductor</th>
                  <th className="num">Peajes</th>
                  <th className="num">Otros</th>
                  <th className="num">Margen</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {visibleServiceRows.map((row) => {
                  const finance = finances[row.id];
                  const marginValue = (finance?.valor_servicio ?? 0) - directCosts(finance);
                  return (
                    <tr className="is-clickable" key={row.id} onClick={() => openService(row)}>
                      <td>{formatShortDate(row.fecha)}</td>
                      <td>
                        <strong>{row.titulo}</strong>
                        {row.cliente ? <div className="muted">{row.cliente}</div> : null}
                      </td>
                      <td>{driverName(row.conductor_id) || <span className="muted">-</span>}</td>
                      <td>{plate(row.vehiculo_id) || <span className="muted">-</span>}</td>
                      <td><StatusPill value={row.estado} /></td>
                      <td className="num">{finance?.valor_servicio ? formatCOP(finance.valor_servicio) : <span className="status-pill status-pill--warn">Sin valor</span>}</td>
                      <td className="num">{finance?.costo_conductor ? formatCOP(finance.costo_conductor) : "-"}</td>
                      <td className="num">{finance?.costo_peajes ? formatCOP(finance.costo_peajes) : finance?.peajes_cantidad ? `${finance.peajes_cantidad} peajes` : "-"}</td>
                      <td className="num">{finance?.otros_costos ? formatCOP(finance.otros_costos) : "-"}</td>
                      <td className={`num ${marginValue < 0 ? "negative" : "positive"}`}>{finance ? formatCOP(marginValue) : "-"}</td>
                      <td>
                        <span className={`status-pill ${finance?.estado_pago === "PAGADO" ? "status-pill--ok" : finance?.estado_pago === "NO_APLICA" ? "status-pill--muted" : "status-pill--warn"}`}>
                          {finance?.estado_pago === "PAGADO" ? "Pagado" : finance?.estado_pago === "NO_APLICA" ? "No aplica" : "Por cobrar"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {visibleServiceRows.length === 0 ? (
                  <tr>
                    <td className="muted" colSpan={11}>No hay servicios en el periodo.</td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Total</td>
                  <td className="num">{formatCOP(totals.ingresos)}</td>
                  <td className="num">{formatCOP(totals.conductores)}</td>
                  <td className="num">{formatCOP(totals.peajes)}</td>
                  <td className="num">{formatCOP(totals.otrosServicio)}</td>
                  <td className="num">{formatCOP(totals.ingresos - totals.conductores - totals.peajes - totals.otrosServicio)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "gastos" && !isLoading ? (
        <div className="stack-md">
          <div className="action-row">
            <button className="primary-button small-button" onClick={() => setExpenseDraft(emptyExpense(today))} type="button">
              + Registrar gasto
            </button>
            <button className="ghost-button small-button" onClick={() => setExpenseDraft({ ...emptyExpense(today), categoria: "PEAJES", descripcion: "Peaje" })} type="button">
              + Peaje
            </button>
            <button className="ghost-button small-button" onClick={() => setExpenseDraft({ ...emptyExpense(today), categoria: "LAVADO", descripcion: "Lavado" })} type="button">
              + Lavado
            </button>
          </div>
          <div className="data-table-wrap">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoria</th>
                  <th>Descripcion</th>
                  <th>Placa</th>
                  <th>Proveedor</th>
                  <th className="num">Galones</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((row) => (
                  <tr
                    className="is-clickable"
                    key={row.id}
                    onClick={() =>
                      setExpenseDraft({
                        id: row.id,
                        fecha: row.fecha,
                        hora: row.hora?.slice(0, 5) ?? "",
                        categoria: row.categoria,
                        descripcion: row.descripcion,
                        valor: moneyInput(row.valor),
                        vehiculo_id: row.vehiculo_id ?? "",
                        conductor_id: row.conductor_id ?? "",
                        proveedor: row.proveedor ?? "",
                        galones: row.galones?.toString() ?? "",
                        kilometraje: row.kilometraje?.toString() ?? "",
                        metodo_pago: row.metodo_pago ?? "",
                        soporte: row.soporte ?? ""
                      })
                    }
                  >
                    <td>
                      {formatShortDate(row.fecha)}
                      {row.hora ? <span className="muted"> {row.hora.slice(0, 5)}</span> : null}
                    </td>
                    <td><span className="chip">{EXPENSE_CATEGORIES[row.categoria] ?? row.categoria}</span></td>
                    <td>{row.descripcion}</td>
                    <td>{plate(row.vehiculo_id) || "-"}</td>
                    <td>{row.proveedor ?? "-"}</td>
                    <td className="num">{row.galones ?? "-"}</td>
                    <td className="num">{formatCOP(row.valor)}</td>
                  </tr>
                ))}
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td className="muted" colSpan={7}>Sin gastos en el periodo.</td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>Total gastos</td>
                  <td className="num">{formatCOP(totals.gastos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "vehiculos" && !isLoading ? (
        <div className="data-table-wrap">
          <table className="summary-table">
            <thead>
              <tr>
                <th>Vehiculo</th>
                <th className="num">Servicios</th>
                <th className="num">Ingresos</th>
                <th className="num">Costos directos</th>
                <th className="num">Combustible</th>
                <th className="num">Mantenimiento</th>
                <th className="num">Otros gastos</th>
                <th className="num">Utilidad</th>
              </tr>
            </thead>
            <tbody>
              {byVehicle.map((row) => (
                <tr key={row.placa}>
                  <td><strong>{row.placa}</strong></td>
                  <td className="num">{row.servicios}</td>
                  <td className="num">{formatCOP(row.ingresos)}</td>
                  <td className="num">{formatCOP(row.directos)}</td>
                  <td className="num">{formatCOP(row.combustible)}</td>
                  <td className="num">{formatCOP(row.mantenimiento)}</td>
                  <td className="num">{formatCOP(row.otros)}</td>
                  <td className={`num ${row.utilidad < 0 ? "negative" : "positive"}`}>{formatCOP(row.utilidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {editingService ? (
        <div className="drawer-backdrop" onClick={(event) => event.target === event.currentTarget && setEditingService(null)}>
          <aside className="drawer">
            <div className="drawer__head">
              <div>
                <p className="eyebrow">{formatShortDate(editingService.fecha)} · {editingService.hora_inicio.slice(0, 5)}</p>
                <h2>{editingService.titulo}</h2>
                <p className="muted">
                  {driverName(editingService.conductor_id) || "Sin conductor"} · {plate(editingService.vehiculo_id) || "Sin vehiculo"}
                </p>
              </div>
              <button className="icon-button" onClick={() => setEditingService(null)} type="button">✕</button>
            </div>
            <div className="finance-box">
              <strong>
                Margen:{" "}
                {formatCOP(
                  parseMoney(serviceDraft.valor) - parseMoney(serviceDraft.costo_conductor) - parseMoney(serviceDraft.costo_peajes) - parseMoney(serviceDraft.otros_costos)
                )}
              </strong>
              <div className="form-grid">
                <MoneyField label="Valor del servicio" onChange={(value) => setServiceDraft({ ...serviceDraft, valor: value })} value={serviceDraft.valor} />
                <MoneyField label="Conductor + aux. transporte" onChange={(value) => setServiceDraft({ ...serviceDraft, costo_conductor: value })} value={serviceDraft.costo_conductor} />
                <label className="field">
                  <span>Estado de pago</span>
                  <select className="select-field" onChange={(event) => setServiceDraft({ ...serviceDraft, estado_pago: event.target.value as PaymentStatus })} value={serviceDraft.estado_pago}>
                    <option value="PENDIENTE">Por cobrar</option>
                    <option value="PAGADO">Pagado</option>
                    <option value="NO_APLICA">No aplica</option>
                  </select>
                </label>
                <label className="field">
                  <span>Cantidad de peajes</span>
                  <input inputMode="numeric" onChange={(event) => setServiceDraft({ ...serviceDraft, peajes_cantidad: event.target.value.replace(/\D/g, "") })} value={serviceDraft.peajes_cantidad} />
                </label>
                <MoneyField label="Valor peajes" onChange={(value) => setServiceDraft({ ...serviceDraft, costo_peajes: value })} value={serviceDraft.costo_peajes} />
                <MoneyField label="Otros costos" onChange={(value) => setServiceDraft({ ...serviceDraft, otros_costos: value })} value={serviceDraft.otros_costos} />
                <label className="field">
                  <span>Factura N.</span>
                  <input onChange={(event) => setServiceDraft({ ...serviceDraft, factura_numero: event.target.value })} value={serviceDraft.factura_numero} />
                </label>
                <label className="field span-2">
                  <span>Notas</span>
                  <input onChange={(event) => setServiceDraft({ ...serviceDraft, notas: event.target.value })} value={serviceDraft.notas} />
                </label>
              </div>
            </div>
            <div className="action-row">
              <button className="primary-button" disabled={busy} onClick={() => void saveServiceFinance()} type="button">
                {busy ? "Guardando..." : "Guardar"}
              </button>
              <button className="ghost-button" onClick={() => setEditingService(null)} type="button">Cancelar</button>
            </div>
          </aside>
        </div>
      ) : null}

      {expenseDraft ? (
        <div className="drawer-backdrop" onClick={(event) => event.target === event.currentTarget && setExpenseDraft(null)}>
          <aside className="drawer">
            <div className="drawer__head">
              <div>
                <p className="eyebrow">{expenseDraft.id ? "Editar gasto" : "Nuevo gasto"}</p>
                <h2>{EXPENSE_CATEGORIES[expenseDraft.categoria]}</h2>
              </div>
              <button className="icon-button" onClick={() => setExpenseDraft(null)} type="button">✕</button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Fecha</span>
                <input onChange={(event) => setExpenseDraft({ ...expenseDraft, fecha: event.target.value })} type="date" value={expenseDraft.fecha} />
              </label>
              <label className="field">
                <span>Hora</span>
                <input onChange={(event) => setExpenseDraft({ ...expenseDraft, hora: event.target.value })} type="time" value={expenseDraft.hora} />
              </label>
              <label className="field">
                <span>Categoria</span>
                <select className="select-field" onChange={(event) => setExpenseDraft({ ...expenseDraft, categoria: event.target.value })} value={expenseDraft.categoria}>
                  {Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="field span-2">
                <span>Descripcion</span>
                <input onChange={(event) => setExpenseDraft({ ...expenseDraft, descripcion: event.target.value })} value={expenseDraft.descripcion} />
              </label>
              <MoneyField label="Valor" onChange={(value) => setExpenseDraft({ ...expenseDraft, valor: value })} value={expenseDraft.valor} />
              <label className="field">
                <span>Vehiculo</span>
                <select className="select-field" onChange={(event) => setExpenseDraft({ ...expenseDraft, vehiculo_id: event.target.value })} value={expenseDraft.vehiculo_id}>
                  <option value="">General (sin vehiculo)</option>
                  {vehicles.map((row) => (
                    <option key={row.id} value={row.id}>{row.placa}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Conductor</span>
                <select className="select-field" onChange={(event) => setExpenseDraft({ ...expenseDraft, conductor_id: event.target.value })} value={expenseDraft.conductor_id}>
                  <option value="">-</option>
                  {drivers.map((row) => (
                    <option key={row.id} value={row.id}>{row.nombre_completo}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Proveedor / estacion</span>
                <input onChange={(event) => setExpenseDraft({ ...expenseDraft, proveedor: event.target.value })} value={expenseDraft.proveedor} />
              </label>
              {expenseDraft.categoria === "COMBUSTIBLE" ? (
                <>
                  <label className="field">
                    <span>Galones</span>
                    <input inputMode="decimal" onChange={(event) => setExpenseDraft({ ...expenseDraft, galones: event.target.value })} value={expenseDraft.galones} />
                  </label>
                  <label className="field">
                    <span>Kilometraje</span>
                    <input inputMode="numeric" onChange={(event) => setExpenseDraft({ ...expenseDraft, kilometraje: event.target.value })} value={expenseDraft.kilometraje} />
                  </label>
                </>
              ) : null}
              <label className="field">
                <span>Metodo de pago</span>
                <select className="select-field" onChange={(event) => setExpenseDraft({ ...expenseDraft, metodo_pago: event.target.value })} value={expenseDraft.metodo_pago}>
                  <option value="">-</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="TARJETA">Tarjeta</option>
                  <option value="CREDITO">Credito</option>
                </select>
              </label>
              <label className="field span-2">
                <span>Soporte (N. factura o recibo)</span>
                <input onChange={(event) => setExpenseDraft({ ...expenseDraft, soporte: event.target.value })} value={expenseDraft.soporte} />
              </label>
            </div>
            <div className="action-row">
              <button className="primary-button" disabled={busy} onClick={() => void saveExpense()} type="button">
                {busy ? "Guardando..." : "Guardar"}
              </button>
              <button className="ghost-button" onClick={() => setExpenseDraft(null)} type="button">Cancelar</button>
              <span className="spacer" />
              {expenseDraft.id ? (
                <button className="danger-button small-button" onClick={() => void deleteExpense(expenseDraft.id)} type="button">Eliminar</button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
