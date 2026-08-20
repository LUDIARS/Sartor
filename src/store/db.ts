import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

export type SartorDatabase = DatabaseSync;

const migrationSql = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS garments (
    id TEXT PRIMARY KEY,
    brand TEXT NOT NULL,
    product_id TEXT NOT NULL,
    price_group TEXT NOT NULL,
    name TEXT NOT NULL,
    gender TEXT NOT NULL,
    kind TEXT NOT NULL,
    sub_kind TEXT NOT NULL DEFAULT 'other',
    price_jpy INTEGER NOT NULL,
    currency TEXT NOT NULL,
    colors_json TEXT NOT NULL,
    sizes_json TEXT NOT NULL,
    composition TEXT,
    washing_info TEXT,
    dryer_ok INTEGER,
    color_bleed_risk TEXT,
    care_reasons_json TEXT NOT NULL,
    image_url TEXT,
    product_url TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    crawled_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    display_name TEXT,
    gender TEXT NOT NULL,
    age_band TEXT NOT NULL,
    height_cm INTEGER,
    weight_kg INTEGER,
    top_size TEXT NOT NULL,
    bottom_size TEXT NOT NULL,
    body_notes TEXT,
    fav_colors_json TEXT NOT NULL,
    avoid_colors_json TEXT NOT NULL,
    ng_materials_json TEXT NOT NULL,
    uses_dryer INTEGER NOT NULL,
    avoid_color_bleed INTEGER NOT NULL,
    monthly_budget_jpy INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    vector_json TEXT NOT NULL,
    budget_jpy INTEGER NOT NULL,
    kinds_json TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS proposal_options (
    proposal_id INTEGER NOT NULL REFERENCES proposals(id),
    option_index INTEGER NOT NULL CHECK (option_index BETWEEN 0 AND 2),
    total_jpy INTEGER NOT NULL,
    over_budget INTEGER NOT NULL,
    rationale TEXT NOT NULL,
    cautions_json TEXT NOT NULL,
    PRIMARY KEY (proposal_id, option_index)
  );

  CREATE TABLE IF NOT EXISTS proposal_items (
    proposal_id INTEGER NOT NULL,
    option_index INTEGER NOT NULL,
    garment_id TEXT NOT NULL REFERENCES garments(id),
    role TEXT NOT NULL,
    reason TEXT NOT NULL,
    PRIMARY KEY (proposal_id, option_index, garment_id),
    FOREIGN KEY (proposal_id, option_index) REFERENCES proposal_options(proposal_id, option_index)
  );

  CREATE TABLE IF NOT EXISTS proposal_decisions (
    proposal_id INTEGER NOT NULL,
    option_index INTEGER NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('accept', 'hold', 'reject')),
    note TEXT,
    decided_at TEXT NOT NULL,
    PRIMARY KEY (proposal_id, option_index),
    FOREIGN KEY (proposal_id, option_index) REFERENCES proposal_options(proposal_id, option_index)
  );

  CREATE TABLE IF NOT EXISTS amazon_crawl_progress (
    query TEXT PRIMARY KEY,
    next_page INTEGER NOT NULL,
    upserted INTEGER NOT NULL,
    completed INTEGER NOT NULL,
    processed_asins_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS crawl_cooldowns (
    scope TEXT PRIMARY KEY,
    blocked_until TEXT NOT NULL,
    reason TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS garments_search_idx ON garments (gender, kind, price_jpy);
  CREATE INDEX IF NOT EXISTS proposals_profile_idx ON proposals (profile_id, created_at DESC);
`;

const postColumnMigrationSql = `
  CREATE INDEX IF NOT EXISTS garments_sub_kind_idx ON garments (kind, sub_kind, price_jpy);
`;

function resolveDatabasePath(): string {
  const configuredPath = process.env.SARTOR_DB_PATH?.trim();
  return configuredPath === undefined || configuredPath.length === 0
    ? resolve(process.cwd(), "sartor.sqlite")
    : resolve(configuredPath);
}

/** @implements SPEC-STEP1-PROTOTYPE §11 — CREATE TABLE IF NOT EXISTS で増えない列を既存 DB へ冪等に追加する。 */
const columnAdditions: readonly { table: string; column: string; definition: string }[] = [
  { table: "profiles", column: "weight_kg", definition: "INTEGER" },
  /** @implements SPEC-STEP1C §2 — 既存 DB には 'other' 埋めで足し、reclassify CLI で商品名から補正する。 */
  { table: "garments", column: "sub_kind", definition: "TEXT NOT NULL DEFAULT 'other'" },
  /** @implements SPEC-STEP1C §4 — PR 開発中に作成済みの進捗 DB も処理済み ASIN を保持できるようにする。 */
  { table: "amazon_crawl_progress", column: "processed_asins_json", definition: "TEXT NOT NULL DEFAULT '[]'" },
];

function applyColumnAdditions(database: SartorDatabase): void {
  for (const addition of columnAdditions) {
    const columns = database.prepare(`PRAGMA table_info(${addition.table})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === addition.column)) {
      database.exec(`ALTER TABLE ${addition.table} ADD COLUMN ${addition.column} ${addition.definition}`);
    }
  }
}

export function openDatabase(databasePath = resolveDatabasePath()): SartorDatabase {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(migrationSql);
    applyColumnAdditions(database);
    database.exec(postColumnMigrationSql);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function closeDatabase(database: SartorDatabase): void {
  database.close();
}
