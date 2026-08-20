import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { closeDatabase, openDatabase, type SartorDatabase } from "../src/store/db.js";

test("garment storage adds sub_kind before creating its index on a legacy database", () => {
  const directory = mkdtempSync(join(tmpdir(), "sartor-garment-test-"));
  const databasePath = join(directory, "legacy.sqlite");
  const legacyDatabase = new DatabaseSync(databasePath);
  let legacyDatabaseOpen = true;
  let database: SartorDatabase | undefined;
  try {
    legacyDatabase.exec(`
      CREATE TABLE garments (
        id TEXT PRIMARY KEY,
        gender TEXT NOT NULL,
        kind TEXT NOT NULL,
        price_jpy INTEGER NOT NULL
      );
    `);
    legacyDatabase.close();
    legacyDatabaseOpen = false;

    database = openDatabase(databasePath);
    const columnNames = (database.prepare("PRAGMA table_info(garments)").all() as { name: string }[])
      .map(({ name }) => name);
    const indexNames = (database.prepare("PRAGMA index_list(garments)").all() as { name: string }[])
      .map(({ name }) => name);

    assert.ok(columnNames.includes("sub_kind"));
    assert.ok(indexNames.includes("garments_sub_kind_idx"));
  } finally {
    if (database !== undefined) {
      closeDatabase(database);
    }
    if (legacyDatabaseOpen) {
      legacyDatabase.close();
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
