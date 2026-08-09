import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
