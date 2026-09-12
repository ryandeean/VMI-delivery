/**
 * Loose types for the parts of the Current RMS API we read. Everything is
 * optional because accounts differ (custom fields, units, which phases are used).
 */
export type CrmAddress = {
  id?: number;
  name?: string;
  street?: string;
  address_line_1?: string;
  address_line_2?: string;
  address_line_3?: string;
  city?: string;
  county?: string;
  postcode?: string;
  country_name?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export type CrmEmail = { address?: string; email?: string; email_type_id?: number; email_type_name?: string };
export type CrmPhone = { number?: string; phone_type_id?: number; phone_type_name?: string };

export type CrmMember = {
  id: number;
  name?: string;
  member_type?: number;
  member_type_name?: string;
  organisation_id?: number | null;
  organisation?: { id: number; name?: string } | null;
  job_title?: string;
  primary_address?: CrmAddress | null;
  primary_email?: string | { address?: string } | null;
  primary_phone?: string | { number?: string } | null;
  emails?: CrmEmail[];
  phones?: CrmPhone[];
  email?: string;
  phone?: string;
  active?: boolean;
};

export type CrmUser = { id: number; name?: string; email?: string; first_name?: string; last_name?: string };

export type CrmOpportunity = {
  id: number;
  subject?: string;
  number?: string | number;
  description?: string;
  member_id?: number;
  member?: CrmMember | null;
  contact_id?: number | null;
  contact?: CrmMember | null;
  venue_id?: number | null;
  venue?: (CrmMember & { address?: CrmAddress | null }) | null;
  destination?: { id?: number; name?: string; address?: CrmAddress | null } | null;
  delivery_address?: CrmAddress | null;
  owner?: CrmUser | null;
  owned_by?: number | null;
  state?: number;
  state_name?: string;
  status?: number;
  status_name?: string;
  opportunity_type?: number;
  opportunity_type_name?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  charge_starts_at?: string | null;
  charge_ends_at?: string | null;
  deliver_starts_at?: string | null;
  deliver_ends_at?: string | null;
  collect_starts_at?: string | null;
  collect_ends_at?: string | null;
  custom_fields?: Record<string, unknown> | null;
  tag_list?: string[];
};

export type CrmProduct = {
  id: number;
  name?: string;
  weight?: number | string | null;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  dimensions?: { length?: number; width?: number; height?: number } | string | null;
  custom_fields?: Record<string, unknown> | null;
  product_type?: number;
};

export type CrmOpportunityItem = {
  id: number;
  name?: string;
  quantity?: number | string;
  item_id?: number | null;
  item_type?: string | null;
  transaction_type?: number;
  transaction_type_name?: string;
  opportunity_item_type?: number;
  opportunity_item_type_name?: string;
  item?: CrmProduct | null;
  weight?: number | string | null;
};

export type Contact = { name: string; phone: string; email: string; role?: string };

/** What the sync produces for each delivery / collection, before it is saved as a Job. */
export type ImportedJob = {
  externalId: string;
  opportunityId: number;
  opportunityNumber: string;
  subject: string;
  type: "DELIVERY" | "COLLECTION";
  clientName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  secondaryContacts: Contact[];
  accountHandlerName: string;
  accountHandlerEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
  lat: number | null;
  lng: number | null;
  date: string;
  windowStart: Date | null;
  windowEnd: Date | null;
  items: { name: string; quantity: number; volumeM3?: number | null; weightKg?: number | null; isService?: boolean; currentItemId?: number | null }[];
  notes: string;
};
