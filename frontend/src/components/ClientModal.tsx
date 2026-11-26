import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api, apiError, type ApiError, type Client } from "../api";
import { useToast } from "../store";
import { Button, Modal, errCls, inputCls } from "../ui";

const ALLERGIES = ["Ninguna", "Embarazo", "Diabetes", "Queloides", "Epilepsia", "Marcapasos", "Medicación fotosensibilizante", "Látex"];
const schema = z.object({
  full_name: z.string().trim().min(3, "Mínimo 3 caracteres"),
  national_id: z.string().trim().regex(/^[A-Za-z]?-?\d{5,12}$/, "Cédula inválida (ej. V12345678)"),
  phone: z.string().trim().min(7, "Teléfono inválido"),
  allergies_conditions: z.array(z.string()).min(1, "Elige una afección o «Ninguna»"),
});
type CF = z.infer<typeof schema>;
const EMPTY: CF = { full_name: "", national_id: "", phone: "", allergies_conditions: [] }; // sin selección previa: hay que elegir

/** Alta (sin `client`) o edición (con `client`). Con `repeatable` ofrece "Guardar y agregar otro".
 *  onDone(cliente, another): `another` = true cuando el modal debe seguir abierto para otro registro. */
export default function ClientModal({ client, repeatable = false, onClose, onDone }:
  { client?: Client; repeatable?: boolean; onClose: () => void; onDone: (c: Client, another: boolean) => void }) {
  const toast = useToast((t) => t.show), qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<CF>({
    resolver: zodResolver(schema), mode: "onBlur",
    defaultValues: client ? { full_name: client.full_name, national_id: client.national_id, phone: client.phone, allergies_conditions: client.allergies_conditions } : EMPTY
  });
  const [err, setErr] = useState<ApiError | null>(null);
  const sel = watch("allergies_conditions");

  // «Ninguna» es excluyente, pero ya nunca bloquea al resto: elegir una afección la reemplaza y pulsarla de nuevo la quita.
  const toggle = (a: string) => setValue("allergies_conditions",
    a === "Ninguna" ? (sel.includes("Ninguna") ? [] : ["Ninguna"])
      : sel.includes(a) ? sel.filter((x) => x !== a) : [...sel.filter((x) => x !== "Ninguna"), a], { shouldValidate: true });

  const save = (another: boolean) => handleSubmit(async (v) => {
    setErr(null);
    try {
      const { data } = client ? await api.put<Client>(`/clients/${client.id}`, v) : await api.post<Client>("/clients", v);
      qc.invalidateQueries({ queryKey: ["clients"] }); qc.invalidateQueries({ queryKey: ["client"] }); // las listas muestran a todos
      toast("ok", another ? `${data.full_name} registrado. Agrega el siguiente.` : "Cambio registrado");
      onDone(data, another);
      if (another) reset(EMPTY);
    } catch (e) { setErr(apiError(e)); }
  });

  const field = (k: "full_name" | "national_id" | "phone", label: string) => (
    <label className="block"><span className="mb-1 block text-xs">{label}</span>
      <input className={inputCls} {...register(k)} />
      {errors[k] && <span className={errCls}><AlertTriangle size={12} />{errors[k]?.message}</span>}</label>
  );
  return (
    <Modal title={client ? "Editar cliente" : "Nuevo cliente"} onClose={onClose} footer={<>
      <Button variant="text" onClick={onClose}>Cancelar</Button>
      {repeatable && !client && <Button variant="ghost" onClick={save(true)} disabled={isSubmitting}>Guardar y agregar otro</Button>}
      <Button variant="primary" onClick={save(false)} disabled={isSubmitting}>Guardar cliente</Button></>}>
      <form onSubmit={save(false)} className="space-y-3">
        {field("full_name", "Nombre completo")}{field("national_id", "Cédula")}{field("phone", "Teléfono")}
        <div><span className="mb-1 block text-xs">Afección / condición (elige una o varias)</span>
          <div className="flex flex-wrap gap-2">
            {ALLERGIES.map((a) => (
              <button type="button" key={a} aria-pressed={sel.includes(a)} onClick={() => toggle(a)}
                className={`rounded-full border px-3 py-1 text-xs ${sel.includes(a) ? "border-olive bg-olive text-bone" : "border-beige bg-beige/30 text-olive hover:bg-beige/50"}`}>{a}</button>))}
          </div>
          {errors.allergies_conditions && <span className={errCls}><AlertTriangle size={12} />{errors.allergies_conditions.message}</span>}</div>
        {err && <div className={errCls}><AlertTriangle size={14} />{err.message}
          {err.client_id && <button type="button" className="ml-2 underline" onClick={async () => onDone((await api.get<Client>(`/clients/${err.client_id}`)).data, false)}>Usar ficha existente</button>}</div>}
      </form>
    </Modal>
  );
}