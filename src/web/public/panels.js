/** @implements SPEC-STEP1-PROTOTYPE §2 — ステップ入力を順に表示する。 */
function panelOf(id) {
  const panel = document.getElementById(id);
  if (panel === null) {
    throw new Error(`Panel #${id} does not exist.`);
  }
  return panel;
}

/** @implements SPEC-STEP1-PROTOTYPE §2 — 提案・履歴パネルを表示する。 */
export function showPanel(id) {
  panelOf(id).hidden = false;
}

/** @implements SPEC-STEP1-PROTOTYPE §2 — 次の未入力ステップを開く。 */
export function openPanel(id) {
  const panel = panelOf(id);
  panel.hidden = false;
  if (panel instanceof HTMLDetailsElement) {
    panel.open = true;
  }
}

/** @implements SPEC-STEP1-PROTOTYPE §2 — 入力済みステップを要約付きで畳む。 */
export function collapsePanel(id, summaryText) {
  const panel = panelOf(id);
  panel.hidden = false;
  const summary = panel.querySelector("[data-summary]");
  if (summary !== null) {
    summary.textContent = summaryText;
    summary.hidden = summaryText.length === 0;
  }
  if (panel instanceof HTMLDetailsElement) {
    panel.open = false;
  }
}
