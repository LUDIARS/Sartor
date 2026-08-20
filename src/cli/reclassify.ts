import { classifyGarmentSubKind } from "../domain/subkind-classifier.js";
import { logError, logInfo } from "../log.js";
import { closeDatabase, openDatabase } from "../store/db.js";
import { GarmentRepository } from "../store/garment-repo.js";

/** @implements SPEC-STEP1C §2 — sub_kind を後から足した既存行を、商品名から分類し直して埋める。 */
function main(): void {
  const database = openDatabase();
  try {
    const repository = new GarmentRepository(database);
    const garments = repository.search();
    let updated = 0;
    for (const garment of garments) {
      const subKind = classifyGarmentSubKind(garment.kind, garment.name);
      if (subKind !== garment.subKind) {
        repository.updateSubKind(garment.id, subKind);
        updated += 1;
      }
    }
    logInfo("catalog_reclassified", { total: garments.length, updated });
  } finally {
    closeDatabase(database);
  }
}

try {
  main();
} catch (error: unknown) {
  logError("catalog_reclassify_failed", { message: error instanceof Error ? error.message : "Unknown failure." });
  process.exitCode = 1;
}
