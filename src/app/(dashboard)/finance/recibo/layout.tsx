import { makeGatedLayout } from "@/features/plans/gatedLayout";

// Recibos e declaração anual são do plano pago (spec 20).
export default makeGatedLayout("finance_full");
