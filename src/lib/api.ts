import type {
  DashboardStats,
  DocumentKind,
  DocumentSummary,
  GarageDocument,
  Settings,
} from "../../shared/types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Broadcast so the auth provider can drop the session without prop drilling. */
export const UNAUTHORISED_EVENT = "shedquarters:unauthorised";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORISED_EVENT));
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Response wasn't JSON; keep the generic message.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ------------------------------------------------------------------- session

export const auth = {
  check: () => request<{ authenticated: boolean }>("/api/auth"),
  login: (password: string) =>
    request<{ authenticated: boolean }>("/api/auth", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ authenticated: boolean }>("/api/auth", { method: "DELETE" }),
};

// ----------------------------------------------------------------- documents

export interface ListParams {
  kind?: DocumentKind;
  status?: string;
  q?: string;
}

function listQuery(params: ListParams): string {
  const search = new URLSearchParams();
  if (params.kind) search.set("kind", params.kind);
  if (params.status && params.status !== "all") search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const documents = {
  list: (params: ListParams = {}) =>
    request<{ documents: DocumentSummary[] }>(`/api/documents${listQuery(params)}`).then(
      (data) => data.documents,
    ),

  get: (id: string) =>
    request<{ document: GarageDocument }>(`/api/documents/${id}`).then((data) => data.document),

  create: (payload: Partial<GarageDocument> & { kind: DocumentKind }) =>
    request<{ document: GarageDocument }>("/api/documents", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((data) => data.document),

  update: (id: string, payload: Partial<GarageDocument>) =>
    request<{ document: GarageDocument }>(`/api/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((data) => data.document),

  remove: (id: string) => request<{ deleted: boolean }>(`/api/documents/${id}`, { method: "DELETE" }),

  convert: (id: string, targetKind: DocumentKind) =>
    request<{ document: GarageDocument }>(`/api/documents/${id}/convert`, {
      method: "POST",
      body: JSON.stringify({ targetKind }),
    }).then((data) => data.document),

  csvUrl: (params: ListParams = {}) => {
    const query = listQuery(params);
    return `/api/documents${query}${query ? "&" : "?"}format=csv`;
  },
};

// ------------------------------------------------------------------ settings

export const settings = {
  get: () => request<{ settings: Settings }>("/api/settings").then((data) => data.settings),
  update: (payload: Partial<Settings>) =>
    request<{ settings: Settings }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((data) => data.settings),
};

// --------------------------------------------------------------------- misc

export const stats = {
  get: () => request<{ stats: DashboardStats }>("/api/stats").then((data) => data.stats),
};

export interface CustomerSuggestion {
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  customerEmail: string;
}

export interface VehicleSuggestion extends CustomerSuggestion {
  vehicleReg: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColour: string;
  vehicleVin: string;
  vehicleYear: number | null;
  vehicleMileage: number | null;
  motDue: string | null;
}

export interface HistoryEntry {
  id: string;
  kind: string;
  number: string;
  status: string;
  issueDate: string;
  mileage: number | null;
  workPerformed: string;
}

export const suggest = {
  customers: (q: string) =>
    request<{ suggestions: CustomerSuggestion[] }>(
      `/api/suggest?type=customer&q=${encodeURIComponent(q)}`,
    ).then((data) => data.suggestions),

  vehicles: (q: string) =>
    request<{ suggestions: VehicleSuggestion[] }>(
      `/api/suggest?type=vehicle&q=${encodeURIComponent(q)}`,
    ).then((data) => data.suggestions),

  history: (reg: string) =>
    request<{ history: HistoryEntry[] }>(
      `/api/suggest?type=history&reg=${encodeURIComponent(reg)}`,
    ).then((data) => data.history),
};
