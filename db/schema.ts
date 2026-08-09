import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
});
