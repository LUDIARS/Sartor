import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { closeDatabase, openDatabase, type SartorDatabase } from "../src/store/db.js";
import { ProfileRepository } from "../src/store/profile-repo.js";

test("profile storage adds weight and reads recognizable legacy size labels", () => {
  const directory = mkdtempSync(join(tmpdir(), "sartor-profile-test-"));
  const databasePath = join(directory, "legacy.sqlite");
  const legacyDatabase = new DatabaseSync(databasePath);
  let legacyDatabaseOpen = true;
  let database: SartorDatabase | undefined;
  try {
    legacyDatabase.exec(`
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        display_name TEXT,
        gender TEXT NOT NULL,
        age_band TEXT NOT NULL,
        height_cm INTEGER,
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
    `);
    legacyDatabase.prepare(`
      INSERT INTO profiles (
        id, display_name, gender, age_band, height_cm, top_size, bottom_size, body_notes,
        fav_colors_json, avoid_colors_json, ng_materials_json, uses_dryer, avoid_color_bleed,
        monthly_budget_jpy, updated_at
      ) VALUES (1, NULL, 'MEN', '40s', 175, 'LL', '76cm', NULL, '[]', '[]', '[]', 0, 0, 30000, '2026-08-20T00:00:00.000Z')
    `).run();
    legacyDatabase.close();
    legacyDatabaseOpen = false;

    database = openDatabase(databasePath);
    const columnNames = (database.prepare("PRAGMA table_info(profiles)").all() as { name: string }[])
      .map(({ name }) => name);
    assert.ok(columnNames.includes("weight_kg"));

    const repository = new ProfileRepository(database);
    const migrated = repository.get();
    assert.equal(migrated?.weightKg, null);
    assert.equal(migrated?.topSize, "XL");
    assert.equal(migrated?.bottomSize, null);

    const saved = repository.save({
      displayName: null,
      gender: "MEN",
      ageBand: "40s",
      heightCm: 175,
      weightKg: 72,
      topSize: "XL",
      bottomSize: "M",
      bodyNotes: null,
      favColors: [],
      avoidColors: [],
      ngMaterials: [],
      usesDryer: false,
      avoidColorBleed: false,
      monthlyBudgetJpy: 30_000,
    });
    assert.equal(saved.weightKg, 72);
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
