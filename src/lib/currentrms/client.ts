/**
 * Minimal Current RMS REST client (https://api.current-rms.com/api/v1).
 * Authentication is two headers: X-SUBDOMAIN and X-AUTH-TOKEN.
 */
import { config } from "../config";
import type { CrmMember, CrmOpportunity, CrmOpportunityItem, CrmUser } from "./types";

const BASE = "https://api.current-rms.com/api/v1";

export class CurrentRmsError extends Error {}

export class CurrentRmsClient {
  private memberCache = new Map<number, CrmMember | null>();
  private userCache = new Map<number, CrmUser | null>();

  constructor(
    private readonly subdomain: string,
    private readonly apiKey: string,
  ) {}

  static fromEnv(): CurrentRmsClient | null {
    const c = config.currentRms();
    if (!c.subdomain || !c.apiKey) return null;
    return new CurrentRmsClient(c.subdomain, c.apiKey);
  }

  private async get<T>(path: string, params: Record<string, string | number | undefined> = {}, attempt = 0): Promise<T> {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      headers: { "X-SUBDOMAIN": this.subdomain, "X-AUTH-TOKEN": this.apiKey, Accept: "application/json" },
    });
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return this.get<T>(path, params, attempt + 1);
    }
    if (res.status === 404) throw new CurrentRmsError(`Not found: ${path}`);
    if (!res.ok) throw new CurrentRmsError(`Current RMS ${res.status} for ${path}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  /** Opportunities whose hire period overlaps [from, to] (ISO dates). */
  async listOpportunities(from: string, to: string): Promise<CrmOpportunity[]> {
    const all: CrmOpportunity[] = [];
    for (let page = 1; page < 50; page++) {
      const data = await this.get<{ opportunities: CrmOpportunity[]; meta?: { total_row_count?: number; per_page?: number } }>("/opportunities", {
        page,
        per_page: 100,
        "q[starts_at_lteq]": `${to}T23:59:59Z`,
        "q[ends_at_gteq]": `${from}T00:00:00Z`,
        "q[s]": "starts_at asc",
      });
      all.push(...(data.opportunities ?? []));
      if (!data.opportunities || data.opportunities.length < 100) break;
    }
    return all;
  }

  async getOpportunity(id: number): Promise<CrmOpportunity> {
    const data = await this.get<{ opportunity: CrmOpportunity }>(`/opportunities/${id}`);
    return data.opportunity;
  }

  async listOpportunityItems(id: number): Promise<CrmOpportunityItem[]> {
    const all: CrmOpportunityItem[] = [];
    for (let page = 1; page < 20; page++) {
      const data = await this.get<{ opportunity_items: CrmOpportunityItem[] }>(`/opportunities/${id}/opportunity_items`, { page, per_page: 100 });
      all.push(...(data.opportunity_items ?? []));
      if (!data.opportunity_items || data.opportunity_items.length < 100) break;
    }
    return all;
  }

  async getMember(id: number): Promise<CrmMember | null> {
    if (this.memberCache.has(id)) return this.memberCache.get(id) ?? null;
    let member: CrmMember | null = null;
    try {
      member = (await this.get<{ member: CrmMember }>(`/members/${id}`)).member;
    } catch {
      member = null;
    }
    this.memberCache.set(id, member);
    return member;
  }

  /** People who belong to an organisation (used as secondary contacts). */
  async listOrganisationPeople(orgId: number): Promise<CrmMember[]> {
    try {
      const data = await this.get<{ members: CrmMember[] }>("/members", { "q[organisation_id_eq]": orgId, per_page: 25, "q[active_eq]": "true" });
      return data.members ?? [];
    } catch {
      return [];
    }
  }

  async getUser(id: number): Promise<CrmUser | null> {
    if (this.userCache.has(id)) return this.userCache.get(id) ?? null;
    let user: CrmUser | null = null;
    try {
      user = (await this.get<{ user: CrmUser }>(`/users/${id}`)).user;
    } catch {
      user = null;
    }
    this.userCache.set(id, user);
    return user;
  }

  async ping(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.get("/opportunities", { per_page: 1 });
      return { ok: true, message: "Connected" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}
