import type { Config } from "@netlify/functions";
import { requireAuth } from "./_lib/auth";
import { query, toDateString, toIntOrNull } from "./_lib/db";
import { fail, json, serverError } from "./_lib/respond";

/**
 * Autocomplete and vehicle history, both derived from past documents — there
 * is no separate customer table to keep in sync.
 */
export default async (req: Request): Promise<Response> => {
  const unauthorised = requireAuth(req);
  if (unauthorised) return unauthorised;

  try {
    if (req.method !== "GET") return fail(405, "Method not allowed.");

    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "customer";
    const search = (url.searchParams.get("q") ?? "").trim();

    if (type === "history") {
      return await vehicleHistory(url.searchParams.get("reg") ?? "");
    }

    if (search.length < 1) return json({ suggestions: [] });
    const pattern = `%${search}%`;

    if (type === "vehicle") {
      const rows = await query(
        `SELECT DISTINCT ON (vehicle_reg)
           vehicle_reg, vehicle_make, vehicle_model, vehicle_colour, vehicle_vin,
           vehicle_year, vehicle_mileage, mot_due,
           customer_name, customer_address, customer_phone, customer_email
         FROM documents
         WHERE vehicle_reg <> ''
           AND (vehicle_reg ILIKE $1 OR vehicle_make ILIKE $1 OR vehicle_model ILIKE $1)
         ORDER BY vehicle_reg, created_at DESC
         LIMIT 8`,
        [pattern],
      );

      return json({
        suggestions: rows.map((row) => ({
          vehicleReg: String(row.vehicle_reg ?? ""),
          vehicleMake: String(row.vehicle_make ?? ""),
          vehicleModel: String(row.vehicle_model ?? ""),
          vehicleColour: String(row.vehicle_colour ?? ""),
          vehicleVin: String(row.vehicle_vin ?? ""),
          vehicleYear: toIntOrNull(row.vehicle_year),
          vehicleMileage: toIntOrNull(row.vehicle_mileage),
          motDue: toDateString(row.mot_due),
          customerName: String(row.customer_name ?? ""),
          customerAddress: String(row.customer_address ?? ""),
          customerPhone: String(row.customer_phone ?? ""),
          customerEmail: String(row.customer_email ?? ""),
        })),
      });
    }

    const rows = await query(
      `SELECT DISTINCT ON (lower(customer_name))
         customer_name, customer_address, customer_phone, customer_email
       FROM documents
       WHERE customer_name <> ''
         AND (customer_name ILIKE $1 OR customer_phone ILIKE $1 OR customer_email ILIKE $1)
       ORDER BY lower(customer_name), created_at DESC
       LIMIT 8`,
      [pattern],
    );

    return json({
      suggestions: rows.map((row) => ({
        customerName: String(row.customer_name ?? ""),
        customerAddress: String(row.customer_address ?? ""),
        customerPhone: String(row.customer_phone ?? ""),
        customerEmail: String(row.customer_email ?? ""),
      })),
    });
  } catch (error) {
    return serverError(error);
  }
};

/** Every document previously raised against a registration — the service history. */
async function vehicleHistory(reg: string): Promise<Response> {
  const normalised = reg.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalised) return json({ history: [] });

  const rows = await query(
    `SELECT id, kind, number, status, issue_date, vehicle_mileage, work_performed
     FROM documents
     WHERE regexp_replace(upper(vehicle_reg), '[^A-Z0-9]', '', 'g') = $1
     ORDER BY issue_date DESC, created_at DESC
     LIMIT 50`,
    [normalised],
  );

  return json({
    history: rows.map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      number: String(row.number),
      status: String(row.status),
      issueDate: toDateString(row.issue_date) ?? "",
      mileage: toIntOrNull(row.vehicle_mileage),
      workPerformed: String(row.work_performed ?? ""),
    })),
  });
}

export const config: Config = {
  path: "/api/suggest",
};
