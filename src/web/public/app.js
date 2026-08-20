import { collapsePanel, openPanel, showPanel } from "/panels.js";

const DEFAULT_MONTHLY_BUDGET = 30000;
const STYLE_LABELS = {
  clean: "きれいめ", casual: "カジュアル", street: "ストリート", mode: "モード", natural: "ナチュラル",
  sporty: "スポーティ", classic: "トラッド", minimal: "ミニマル", feminine: "フェミニン", outdoor: "アウトドア",
};
const TPO_LABELS = { work: "仕事", casual: "休日", date: "デート", formal: "冠婚葬祭・式典", outdoor: "アウトドア", home: "在宅", travel: "旅行" };

const state = { profile: null, vectors: null, vector: null, budgetJpy: DEFAULT_MONTHLY_BUDGET };
const statusMessage = document.querySelector("#status-message");
const profileForm = document.querySelector("#profile-form");
const vectorForm = document.querySelector("#vector-form");
const budgetForm = document.querySelector("#budget-form");
const vectorAgeBand = document.querySelector("#vector-age-band");
const vectorTpo = document.querySelector("#vector-tpo");
const vectorSeason = document.querySelector("#vector-season");
const vectorColorTone = document.querySelector("#vector-color-tone");
const styleWeights = document.querySelector("#style-weights");
const proposalOptions = document.querySelector("#proposal-options");
const proposalHistory = document.querySelector("#proposal-history");

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

const KIND_LABELS = {
  tops: "トップス", bottoms: "ボトムス", outer: "アウター", onepiece: "ワンピース",
  shoes: "シューズ", accessory: "小物", inner: "インナー", other: "その他",
};

function profileSummary(profile) {
  const name = profile.displayName ? `${profile.displayName} / ` : "";
  const build = profile.heightCm && profile.weightKg ? ` / ${profile.heightCm}cm ${profile.weightKg}kg` : "";
  return `${name}${profile.gender} ${profile.ageBand}${build} / トップス ${profile.topSize}・ボトムス ${profile.bottomSize} / 月予算 ${formatJpy(profile.monthlyBudgetJpy)}`;
}

function vectorSummary(vector) {
  const styles = vector.styles.map((entry) => `${STYLE_LABELS[entry.style] ?? entry.style}${entry.weight}`).join("・");
  const season = vector.season ? ` / ${vector.season}` : "";
  const colorTone = vector.colorTone ? ` / ${vector.colorTone}` : "";
  return `${vector.ageBand} × ${TPO_LABELS[vector.tpo] ?? vector.tpo} / ${styles}${season}${colorTone}`;
}

function budgetSummary(budgetJpy, kinds) {
  return `上限 ${formatJpy(budgetJpy)} / ${kinds.map((kind) => KIND_LABELS[kind] ?? kind).join("・")}`;
}

function splitList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function formatJpy(value) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "リクエストに失敗しました。");
  }
  return payload;
}

function fillSelect(select, values, selectedValue) {
  select.replaceChildren();
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selectedValue;
    select.append(option);
  }
}

function renderStyleWeights(styles) {
  const defaults = new Map(styles.map((entry) => [entry.style, entry.weight]));
  styleWeights.replaceChildren();
  for (const style of state.vectors.styleAxes) {
    const label = document.createElement("label");
    label.className = "style-choice";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.name = "styles";
    check.value = style;
    check.checked = defaults.has(style);
    const name = document.createElement("span");
    name.textContent = `${style}（${STYLE_LABELS[style]}）`;
    const weight = document.createElement("select");
    weight.name = `weight-${style}`;
    weight.disabled = !check.checked;
    for (const value of [1, 2, 3]) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `重み ${value}`;
      option.selected = (defaults.get(style) ?? 1) === value;
      weight.append(option);
    }
    check.addEventListener("change", () => { weight.disabled = !check.checked; });
    label.append(check, name, weight);
    styleWeights.append(label);
  }
}

function renderVectorDefaults() {
  const defaults = state.vectors.defaults[vectorAgeBand.value][vectorTpo.value];
  renderStyleWeights(defaults);
}

function decorateTpoOptions() {
  for (const option of vectorTpo.options) {
    option.textContent = `${option.value}（${TPO_LABELS[option.value]}）`;
  }
}

function profilePayload() {
  const values = new FormData(profileForm);
  const heightValue = String(values.get("heightCm") ?? "").trim();
  const weightValue = String(values.get("weightKg") ?? "").trim();
  const bodyNotes = String(values.get("bodyNotes") ?? "").trim();
  const displayName = String(values.get("displayName") ?? "").trim();
  return {
    displayName: displayName || null,
    gender: String(values.get("gender")),
    ageBand: String(values.get("ageBand")),
    heightCm: heightValue ? Number(heightValue) : null,
    weightKg: weightValue ? Number(weightValue) : null,
    topSize: String(values.get("topSize") ?? "").trim(),
    bottomSize: String(values.get("bottomSize") ?? "").trim(),
    bodyNotes: bodyNotes || null,
    favColors: splitList(String(values.get("favColors") ?? "")),
    avoidColors: splitList(String(values.get("avoidColors") ?? "")),
    ngMaterials: splitList(String(values.get("ngMaterials") ?? "")),
    usesDryer: profileForm.elements.usesDryer.checked,
    avoidColorBleed: profileForm.elements.avoidColorBleed.checked,
    monthlyBudgetJpy: Number(values.get("monthlyBudgetJpy")),
  };
}

function populateProfile(profile) {
  for (const [name, value] of Object.entries({
    displayName: profile.displayName ?? "",
    gender: profile.gender,
    ageBand: profile.ageBand,
    heightCm: profile.heightCm ?? "",
    weightKg: profile.weightKg ?? "",
    topSize: profile.topSize ?? "",
    bottomSize: profile.bottomSize ?? "",
    bodyNotes: profile.bodyNotes ?? "",
    favColors: profile.favColors.join(", "),
    avoidColors: profile.avoidColors.join(", "),
    ngMaterials: profile.ngMaterials.join(", "),
    monthlyBudgetJpy: profile.monthlyBudgetJpy,
  })) {
    profileForm.elements[name].value = value;
  }
  profileForm.elements.usesDryer.checked = profile.usesDryer;
  profileForm.elements.avoidColorBleed.checked = profile.avoidColorBleed;
}

function vectorPayload() {
  const styles = Array.from(styleWeights.querySelectorAll("input[name=styles]:checked")).map((input) => ({
    style: input.value,
    weight: Number(vectorForm.elements[`weight-${input.value}`].value),
  }));
  return {
    ageBand: vectorAgeBand.value,
    tpo: vectorTpo.value,
    styles,
    ...(vectorSeason.value ? { season: vectorSeason.value } : {}),
    ...(vectorColorTone.value ? { colorTone: vectorColorTone.value } : {}),
  };
}

function productItem(item) {
  const card = document.createElement("li");
  card.className = "product-item";
  if (item.garment.imageUrl) {
    const image = document.createElement("img");
    image.src = item.garment.imageUrl;
    image.alt = item.garment.name;
    card.append(image);
  }
  const content = document.createElement("div");
  const link = document.createElement("a");
  link.href = item.garment.productUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = item.garment.name;
  const details = document.createElement("p");
  details.textContent = `${item.garment.brand} / ${formatJpy(item.garment.priceJpy)} / ${item.garment.colors.join("・") || "色情報なし"}`;
  const care = document.createElement("p");
  care.className = "care";
  care.textContent = `素材: ${item.garment.composition ?? "不明"} ｜ 乾燥機: ${item.garment.dryerOk === true ? "可" : item.garment.dryerOk === false ? "不可" : "不明"} ｜ 色落ち: ${item.garment.colorBleedRisk ?? "不明"}`;
  content.append(link, details, care);
  if (item.garment.careReasons.length > 0) {
    const careReasons = document.createElement("ul");
    careReasons.className = "care-reasons";
    for (const reason of item.garment.careReasons) {
      const entry = document.createElement("li");
      entry.textContent = reason;
      careReasons.append(entry);
    }
    content.append(careReasons);
  }
  card.append(content);
  return card;
}

function renderProposals(proposalId, options) {
  proposalOptions.replaceChildren();
  for (const option of options) {
    const card = document.createElement("article");
    card.className = "proposal-option";
    const heading = document.createElement("h3");
    heading.textContent = `案 ${option.optionIndex + 1} — ${formatJpy(option.totalJpy)} (${option.budgetDifferenceJpy >= 0 ? "予算残" : "超過"} ${formatJpy(Math.abs(option.budgetDifferenceJpy))})`;
    const rationale = document.createElement("p");
    rationale.textContent = option.rationale;
    const products = document.createElement("ul");
    for (const item of option.items) products.append(productItem(item));
    const cautions = document.createElement("ul");
    cautions.className = "cautions";
    for (const caution of option.cautions) {
      const entry = document.createElement("li");
      entry.textContent = caution;
      cautions.append(entry);
    }
    const note = document.createElement("textarea");
    note.placeholder = "判断メモ（任意）";
    const controls = document.createElement("div");
    controls.className = "decision-controls";
    for (const decision of ["accept", "hold", "reject"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.decision = decision;
      button.textContent = ({ accept: "採用", hold: "保留", reject: "却下" })[decision];
      button.addEventListener("click", async () => {
        try {
          await requestJson(`/api/proposals/${proposalId}/decision`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ optionIndex: option.optionIndex, decision, note: note.value.trim() || null }),
          });
          setStatus(`案 ${option.optionIndex + 1} を${button.textContent}にしました。`);
          await loadHistory();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "判断を保存できませんでした。", true);
        }
      });
      controls.append(button);
    }
    card.append(heading, rationale, products, cautions, note, controls);
    proposalOptions.append(card);
  }
  showPanel("proposals");
}

async function loadHistory() {
  const { proposals } = await requestJson("/api/proposals");
  proposalHistory.replaceChildren();
  if (proposals.length === 0) {
    proposalHistory.textContent = "まだ提案履歴はありません。";
  } else {
    const accepted = proposals.flatMap((proposal) => Object.entries(proposal.decisions)
      .filter(([, decision]) => decision.decision === "accept")
      .map(([optionIndex]) => ({ proposal, optionIndex })));
    if (accepted.length > 0) {
      const coordinateBookHeading = document.createElement("h3");
      coordinateBookHeading.textContent = "コーデ帳（採用）";
      const coordinateBook = document.createElement("ul");
      for (const entry of accepted) {
        const item = document.createElement("li");
        item.textContent = `提案 #${entry.proposal.id} / 案 ${Number(entry.optionIndex) + 1} — ${formatJpy(entry.proposal.budgetJpy)}`;
        coordinateBook.append(item);
      }
      proposalHistory.append(coordinateBookHeading, coordinateBook);
    }
    const historyHeading = document.createElement("h3");
    historyHeading.textContent = "提案履歴";
    const list = document.createElement("ul");
    for (const proposal of proposals) {
      const item = document.createElement("li");
      const decisions = Object.values(proposal.decisions).map((decision) => decision.decision).join(" / ") || "未判断";
      item.textContent = `${new Date(proposal.createdAt).toLocaleString("ja-JP")} — ${formatJpy(proposal.budgetJpy)} — ${decisions}`;
      list.append(item);
    }
    proposalHistory.append(historyHeading, list);
  }
  showPanel("history-panel");
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const { profile } = await requestJson("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(profilePayload()) });
    state.profile = profile;
    state.budgetJpy = profile.monthlyBudgetJpy;
    vectorAgeBand.value = profile.ageBand;
    renderVectorDefaults();
    budgetForm.elements.budgetJpy.value = String(state.budgetJpy);
    collapsePanel("profile-panel", profileSummary(profile));
    openPanel("vector-panel");
    setStatus("プロフィールを保存しました。次に装いのベクトルを選んでください。編集する時は 01 の見出しを開いてください。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "プロフィールを保存できませんでした。", true);
  }
});

vectorAgeBand.addEventListener("change", renderVectorDefaults);
vectorTpo.addEventListener("change", renderVectorDefaults);

vectorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const vector = vectorPayload();
  if (vector.styles.length === 0) {
    setStatus("スタイル軸を 1 つ以上選んでください。", true);
    return;
  }
  state.vector = vector;
  collapsePanel("vector-panel", vectorSummary(vector));
  openPanel("budget-panel");
  setStatus("予算と対象アイテムを選んで、3 案の提案を依頼してください。");
});

budgetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const kinds = Array.from(budgetForm.querySelectorAll("input[name=kinds]:checked")).map((input) => input.value);
  if (kinds.length === 0) {
    setStatus("対象アイテムを 1 つ以上選んでください。", true);
    return;
  }
  try {
    setStatus("候補を確認し、3 案を生成しています…");
    const { proposalId, options } = await requestJson("/api/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vector: state.vector, budgetJpy: Number(budgetForm.elements.budgetJpy.value), kinds }),
    });
    collapsePanel("budget-panel", budgetSummary(Number(budgetForm.elements.budgetJpy.value), kinds));
    renderProposals(proposalId, options);
    await loadHistory();
    setStatus("3 案を生成しました。ケアの注意を確認して判断してください。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "提案を生成できませんでした。", true);
  }
});

async function initialize() {
  try {
    const [{ profile }, vectors] = await Promise.all([requestJson("/api/profile"), requestJson("/api/vectors")]);
    state.profile = profile;
    state.vectors = vectors;
    fillSelect(vectorAgeBand, vectors.ageBands, profile?.ageBand ?? "20s");
    fillSelect(vectorTpo, vectors.tpos, "casual");
    decorateTpoOptions();
    fillSelect(vectorSeason, ["", ...vectors.seasons], "");
    fillSelect(vectorColorTone, ["", ...vectors.colorTones], "");
    vectorSeason.options[0].textContent = "指定しない（今日の日付から判定）";
    vectorColorTone.options[0].textContent = "指定しない";
    renderVectorDefaults();
    if (profile) {
      populateProfile(profile);
      state.budgetJpy = profile.monthlyBudgetJpy;
      budgetForm.elements.budgetJpy.value = String(profile.monthlyBudgetJpy);
      if (profile.topSize === null || profile.bottomSize === null) {
        setStatus("保存済みのサイズ表記を自動変換できませんでした。日本サイズを選び直してプロフィールを保存してください。", true);
        return;
      }
      collapsePanel("profile-panel", profileSummary(profile));
      openPanel("vector-panel");
      setStatus("保存済みプロフィールを読み込みました。ベクトルを選んでください。プロフィールを直す時は 01 の見出しを開いてください。");
      await loadHistory();
    } else {
      setStatus("最初にプロフィールを入力してください。");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "初期化できませんでした。", true);
  }
}

void initialize();
