import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const reviewFeedback = sqliteTable("review_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  reviewerName: text("reviewer_name"),
  reviewerEmail: text("reviewer_email"),
  usefulness: integer("usefulness").notNull(),
  trust: integer("trust").notNull(),
  clarity: integer("clarity").notNull(),
  mostValuable: text("most_valuable").notNull(),
  confusing: text("confusing").notNull(),
  nextFeature: text("next_feature").notNull(),
  notes: text("notes"),
  sourcePath: text("source_path"),
  featureArea: text("feature_area").notNull().default("overall"),
  failureModes: text("failure_modes").notNull().default("[]"),
  reviewerIntent: text("reviewer_intent").notNull().default("maybe"),
  triageStatus: text("triage_status").notNull().default("new"),
  impactLane: text("impact_lane").notNull().default("untriaged"),
}, (table) => [index("idx_review_feedback_created_at").on(table.createdAt)]);

export const attomEnrichment = sqliteTable("attom_enrichment", {
  propertyKey: text("property_key").primaryKey(),
  propertyId: text("property_id"),
  marketId: text("market_id").notNull(),
  normalizedAddress: text("normalized_address").notNull(),
  providerStatus: text("provider_status").notNull(),
  attomId: text("attom_id"),
  payload: text("payload"),
  avmValue: real("avm_value"),
  avmLow: real("avm_low"),
  avmHigh: real("avm_high"),
  avmConfidence: real("avm_confidence"),
  providerModifiedAt: text("provider_modified_at"),
  fetchedAt: text("fetched_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  errorMessage: text("error_message"),
  apiCallCount: integer("api_call_count").notNull().default(1),
}, (table) => [
  index("idx_attom_enrichment_market").on(table.marketId),
  index("idx_attom_enrichment_expiry").on(table.expiresAt),
  index("idx_attom_enrichment_property").on(table.propertyId),
]);

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const userFavorites = sqliteTable("user_favorites", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => userProfiles.userId, { onDelete: "cascade" }),
  targetType: text("target_type", { enum: ["area", "property"] }).notNull(),
  targetId: text("target_id").notNull(),
  targetName: text("target_name").notNull(),
  marketId: text("market_id"),
  snapshotJson: text("snapshot_json").notNull().default("{}"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_user_favorites_owner_target").on(table.userId, table.targetType, table.targetId),
  index("idx_user_favorites_owner_created").on(table.userId, table.createdAt),
]);

export const roadmapNotes = sqliteTable("roadmap_notes", {
  id: text("id").primaryKey(),
  ownerKey: text("owner_key").notNull(),
  title: text("title").notNull(),
  businessCase: text("business_case").notNull().default("overall"),
  notes: text("notes").notNull(),
  nextAction: text("next_action"),
  priority: text("priority", { enum: ["high", "medium", "low"] }).notNull().default("medium"),
  status: text("status", { enum: ["idea", "researching", "building", "validating", "ready"] }).notNull().default("idea"),
  horizon: text("horizon", { enum: ["now", "next", "later"] }).notNull().default("next"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_roadmap_notes_owner_horizon_updated").on(table.ownerKey, table.horizon, table.updatedAt),
]);
