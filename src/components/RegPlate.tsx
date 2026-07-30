import { formatReg } from "../../shared/format";

/** UK-style yellow plate — the first thing anyone looks for on a garage invoice. */
export function RegPlate({ reg }: { reg: string }) {
  const formatted = formatReg(reg);
  if (!formatted) return <span className="reg-plate empty">No reg</span>;
  return <span className="reg-plate">{formatted}</span>;
}
