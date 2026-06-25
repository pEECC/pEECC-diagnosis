const STORE_KEY = "emergency_care_facility_diagnostic_tool_v4";
const FREQUENCY_OPTIONS = ["Always", "Usually", "Rarely", "Never"];
const PHASE_ORDER = ["ENTRY", "RECOGNITION", "RESPONSE", "CONTINUITY", "ESCALATION"];

let eecc = null;
let lccQuestions = null;
let state = loadState();
let activeWardIndex = 0;

function defaultState() {
  return {
    facility: { profile: {}, availability: {} },
    wards: [newWard("Ward/unit 1")],
    lcc: {}
  };
}

function newWard(name = "New ward/unit") {
  return {
    id: `ward_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name,
    profile: { ward_unit_name: name },
    readiness: {}
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed.wards || !Array.isArray(parsed.wards) || parsed.wards.length === 0) parsed.wards = [newWard("Ward/unit 1")];
    if (!parsed.facility) parsed.facility = { profile: {}, availability: {} };
    if (!parsed.facility.profile) parsed.facility.profile = {};
    if (!parsed.facility.availability) parsed.facility.availability = {};
    if (!parsed.lcc) parsed.lcc = {};
    return parsed;
  } catch (error) {
    console.error("Failed to load saved data", error);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  updateDashboard();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getWard() {
  if (!state.wards[activeWardIndex]) activeWardIndex = 0;
  return state.wards[activeWardIndex];
}

function selectedArray(value) {
  return Array.isArray(value) ? value : [];
}

function setPath(root, path, value) {
  let ref = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (!ref[path[i]]) ref[path[i]] = {};
    ref = ref[path[i]];
  }
  ref[path[path.length - 1]] = value;
}

function getPath(root, path, fallback = "") {
  let ref = root;
  for (const key of path) {
    if (ref == null || ref[key] == null) return fallback;
    ref = ref[key];
  }
  return ref;
}

function inputControl({ value, id, type = "text", onChange, placeholder = "" }) {
  if (type === "textarea") {
    return `<textarea id="${id}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
  }
  return `<input id="${id}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`;
}

function radioYN(name, value) {
  return `<span class="inline-radio">
    <label><input type="radio" name="${name}" value="Y" ${value === "Y" ? "checked" : ""}> Y</label>
    <label><input type="radio" name="${name}" value="N" ${value === "N" ? "checked" : ""}> N</label>
  </span>`;
}

function selectControl(id, value, options, blank = true) {
  const blankOption = blank ? `<option value=""></option>` : "";
  return `<select id="${id}">${blankOption}${options.map(opt => `<option value="${escapeHtml(opt)}" ${value === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`).join("")}</select>`;
}

function renderField(field, value, id) {
  if (field.type === "textarea") return inputControl({ value, id, type: "textarea" });
  if (field.type === "number") return inputControl({ value, id, type: "number" });
  if (field.type === "radio") return `<div class="radio-stack">${field.options.map(opt => `<label><input type="radio" name="${id}" value="${escapeHtml(opt)}" ${value === opt ? "checked" : ""}> ${escapeHtml(opt)}</label>`).join("")}</div>`;
  if (field.type === "checkboxes") {
    const arr = selectedArray(value);
    return `<div class="checkbox-stack">${field.options.map(opt => `<label><input type="checkbox" name="${id}" value="${escapeHtml(opt)}" ${arr.includes(opt) ? "checked" : ""}> ${escapeHtml(opt)}</label>`).join("")}</div>`;
  }
  return inputControl({ value, id, type: "text" });
}

function bindProfileField(containerId, rootObj, pathPrefix, field) {
  const id = `${containerId}_${field.key}`;
  const el = document.getElementById(id);
  if (!el) return;
  if (field.type === "checkboxes") {
    document.querySelectorAll(`input[name="${id}"]`).forEach(cb => {
      cb.addEventListener("change", () => {
        const vals = Array.from(document.querySelectorAll(`input[name="${id}"]:checked`)).map(x => x.value);
        setPath(rootObj, [...pathPrefix, field.key], vals);
        if (field.key === "ward_unit_name") syncWardName();
        saveState();
      });
    });
  } else if (field.type === "radio") {
    document.querySelectorAll(`input[name="${id}"]`).forEach(rb => {
      rb.addEventListener("change", () => {
        setPath(rootObj, [...pathPrefix, field.key], rb.value);
        saveState();
      });
    });
  } else {
    el.addEventListener("input", () => {
      setPath(rootObj, [...pathPrefix, field.key], el.value);
      if (field.key === "ward_unit_name") syncWardName();
      saveState();
    });
  }
}

function syncWardName() {
  const ward = getWard();
  ward.name = ward.profile.ward_unit_name || ward.name || `Ward/unit ${activeWardIndex + 1}`;
  renderWardSelect();
}

function renderFacilityProfile() {
  const rows = eecc.facility_profile.map(field => {
    const value = state.facility.profile[field.key];
    const id = `facility_profile_${field.key}`;
    return `<tr>
      <th style="width: 30%;">${escapeHtml(field.label)}${field.help ? `<div class="small">${escapeHtml(field.help)}</div>` : ""}</th>
      <td>${renderField(field, value, id)}</td>
    </tr>`;
  }).join("");
  document.getElementById("facilityProfile").innerHTML = `<table><tbody>${rows}</tbody></table>`;
  eecc.facility_profile.forEach(field => bindProfileField("facility_profile", state, ["facility", "profile"], field));
}

function renderFacilityAvailability() {
  const rows = eecc.facility_availability.map(row => {
    const itemState = state.facility.availability[row.n] || {};
    const name = `facility_availability_${row.n}`;
    const extra = row.extra_fields ? `<div class="small extra-fields">${row.extra_fields.map(label => {
      const key = label.toLowerCase().replaceAll(" ", "_");
      const id = `${name}_${key}`;
      return `<label>${escapeHtml(label)} ${inputControl({ value: itemState[key], id, type: key === "proportion" ? "text" : "number" })}</label>`;
    }).join("<br>")}</div>` : "";
    return `<tr>
      <td>${row.n}</td>
      <td>${escapeHtml(row.item)}${extra}</td>
      <td>${radioYN(name, itemState.available)}</td>
      <td>${inputControl({ value: itemState.comments, id: `${name}_comments`, type: "textarea" })}</td>
      <td>${escapeHtml(row.analysis || "")}</td>
    </tr>`;
  }).join("");

  const score = calculateFacilityAvailabilityScore();
  document.getElementById("facilityAvailability").innerHTML = `<table>
    <thead><tr><th></th><th>Item</th><th>Available<br><span class="small">(circle Yes or No)</span></th><th>Comments</th><th>Analysis<br><span class="small">(yes = 1 point)</span></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="score-box"><span class="score-large">Points: ${score.points} / 25</span><br>Points divided by 25 multiplied by 100 = <b>AVAILABILITY SCORE: ${score.percent}%</b></div>`;

  eecc.facility_availability.forEach(row => {
    const name = `facility_availability_${row.n}`;
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
      input.addEventListener("change", () => {
        if (!state.facility.availability[row.n]) state.facility.availability[row.n] = {};
        state.facility.availability[row.n].available = input.value;
        saveState();
        renderFacilityAvailability();
      });
    });
    const commentEl = document.getElementById(`${name}_comments`);
    if (commentEl) commentEl.addEventListener("input", () => {
      if (!state.facility.availability[row.n]) state.facility.availability[row.n] = {};
      state.facility.availability[row.n].comments = commentEl.value;
      saveState();
    });
    (row.extra_fields || []).forEach(label => {
      const key = label.toLowerCase().replaceAll(" ", "_");
      const el = document.getElementById(`${name}_${key}`);
      if (el) el.addEventListener("input", () => {
        if (!state.facility.availability[row.n]) state.facility.availability[row.n] = {};
        state.facility.availability[row.n][key] = el.value;
        saveState();
      });
    });
  });
}

function renderWardSelect() {
  const select = document.getElementById("wardSelect");
  if (!select) return;
  select.innerHTML = state.wards.map((ward, idx) => `<option value="${idx}" ${idx === activeWardIndex ? "selected" : ""}>${escapeHtml(ward.name || ward.profile.ward_unit_name || `Ward/unit ${idx + 1}`)}</option>`).join("");
}

function renderWardProfile() {
  const ward = getWard();
  const rows = eecc.ward_profile.map(field => {
    const value = ward.profile[field.key];
    const id = `ward_profile_${field.key}`;
    return `<tr>
      <th style="width: 30%;">${escapeHtml(field.label)}${field.help ? `<div class="small">${escapeHtml(field.help)}</div>` : ""}</th>
      <td>${renderField(field, value, id)}</td>
    </tr>`;
  }).join("");
  document.getElementById("wardProfile").innerHTML = `<table><tbody>${rows}</tbody></table>`;
  eecc.ward_profile.forEach(field => bindProfileField("ward_profile", ward, ["profile"], field));
}

function renderWardReadiness() {
  const ward = getWard();
  const rows = eecc.ward_readiness.map(row => {
    const itemState = ward.readiness[row.n] || {};
    const base = `ward_${activeWardIndex}_readiness_${row.n}`;
    const commentPrompt = row.comment_prompt ? `<div class="small">${escapeHtml(row.comment_prompt)}</div>` : "";
    const notRelevant = row.response_type === "observed_frequency_optional"
      ? `<label class="small"><input type="checkbox" id="${base}_not_relevant" ${itemState.not_relevant ? "checked" : ""}> Not relevant for this ward and do not score</label>`
      : "";
    return `<tr>
      <td>${row.n}</td>
      <td>${escapeHtml(row.item)}${notRelevant}</td>
      <td>${row.response_type === "count_frequency" ? inputControl({ value: itemState.count_observed, id: `${base}_count_observed`, type: "number" }) : ""}</td>
      <td>${row.response_type === "count_frequency" ? inputControl({ value: itemState.count_functioning, id: `${base}_count_functioning`, type: "number" }) : ""}</td>
      <td>${["observed_frequency", "observed_frequency_optional", "observed_only"].includes(row.response_type) ? radioYN(`${base}_observed`, itemState.observed) : row.response_type === "number_only" ? inputControl({ value: itemState.number, id: `${base}_number`, type: "number" }) : ""}</td>
      <td>${["count_frequency", "observed_frequency", "observed_frequency_optional"].includes(row.response_type) ? selectControl(`${base}_frequency`, itemState.frequency, FREQUENCY_OPTIONS) : ""}</td>
      <td>${commentPrompt}${inputControl({ value: itemState.comments, id: `${base}_comments`, type: "textarea" })}</td>
      <td>${escapeHtml(row.analysis || "")}</td>
    </tr>`;
  }).join("");

  const score = calculateWardReadinessScore(ward);
  const beds = Number(ward.profile.number_of_beds || 0);
  const threshold = beds > 0 ? Math.ceil(beds / 20) : 1;
  document.getElementById("wardReadiness").innerHTML = `<div class="small">For rows 1–5, the app uses functioning count and an item-per-20-beds threshold. Current threshold: ${threshold} functioning item(s), based on ${beds || "no"} beds entered.</div>
  <table>
    <thead><tr><th></th><th>Item</th><th>Count number of items observed</th><th>Count number of items that are functioning (check them)</th><th>Observed</th><th>Is this item available for the nurse in the ward during the night without needing assistance or to go anywhere else (circle the response)</th><th>Comments</th><th>Analysis</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="score-box"><span class="score-large">Points: ${score.points} / ${score.denominator}</span><br>Points divided by ${score.denominator} multiplied by 100 = <b>READINESS SCORE: ${score.percent}%</b></div>`;

  bindWardReadinessInputs();
}

function bindWardReadinessInputs() {
  const ward = getWard();
  eecc.ward_readiness.forEach(row => {
    const base = `ward_${activeWardIndex}_readiness_${row.n}`;
    if (!ward.readiness[row.n]) ward.readiness[row.n] = {};
    const record = ward.readiness[row.n];

    const bindInput = (suffix, prop) => {
      const el = document.getElementById(`${base}_${suffix}`);
      if (el) el.addEventListener("input", () => {
        record[prop] = el.value;
        saveState();
      });
    };

    bindInput("count_observed", "count_observed");
    bindInput("count_functioning", "count_functioning");
    bindInput("number", "number");
    bindInput("comments", "comments");

    const frequency = document.getElementById(`${base}_frequency`);
    if (frequency) frequency.addEventListener("change", () => {
      record.frequency = frequency.value;
      saveState();
      renderWardReadiness();
    });

    document.querySelectorAll(`input[name="${base}_observed"]`).forEach(input => {
      input.addEventListener("change", () => {
        record.observed = input.value;
        saveState();
        renderWardReadiness();
      });
    });

    const notRelevant = document.getElementById(`${base}_not_relevant`);
    if (notRelevant) notRelevant.addEventListener("change", () => {
      record.not_relevant = notRelevant.checked;
      saveState();
      renderWardReadiness();
    });
  });
}

function domainClass(domain) {
  const d = domain.toLowerCase();
  if (d.includes("legitimacy") && d.includes("capability")) return "Mixed";
  if (d.includes("legitimacy") && d.includes("connectedness")) return "Mixed";
  if (d.includes("legitimacy")) return "Legitimacy";
  if (d.includes("capability")) return "Capability";
  if (d.includes("connectedness")) return "Connectedness";
  return "Mixed";
}

function renderLcc() {
  const html = lccQuestions.map((q, idx) => {
    const record = state.lcc[idx] || {};
    const anchors = Object.entries(q.anchors).map(([score, text]) => `
      <label class="anchor-option"><input type="radio" name="lcc_score_${idx}" value="${score}" ${String(record.score) === score ? "checked" : ""}> <b>${score}</b> = ${escapeHtml(text)}</label>
    `).join("");
    return `<article class="lcc-card ${domainClass(q.domain)}">
      <div class="lcc-meta"><span class="pill">${escapeHtml(q.phase)}</span><span class="pill">${escapeHtml(q.cmoc)}</span><span class="pill">Domain: ${escapeHtml(q.domain)}</span></div>
      <h3>${escapeHtml(q.cmoc)}: ${escapeHtml(q.prompt)}</h3>
      <p><b>Domain:</b> ${escapeHtml(q.domain)}</p>
      <p><b>${escapeHtml(q.context)}</b></p>
      ${anchors}
      <label>Evidence / comments
        <textarea id="lcc_comment_${idx}">${escapeHtml(record.comments || "")}</textarea>
      </label>
    </article>`;
  }).join("");
  document.getElementById("lccItems").innerHTML = html;

  lccQuestions.forEach((q, idx) => {
    document.querySelectorAll(`input[name="lcc_score_${idx}"]`).forEach(input => {
      input.addEventListener("change", () => {
        if (!state.lcc[idx]) state.lcc[idx] = {};
        state.lcc[idx].score = Number(input.value);
        saveState();
      });
    });
    const comment = document.getElementById(`lcc_comment_${idx}`);
    if (comment) comment.addEventListener("input", () => {
      if (!state.lcc[idx]) state.lcc[idx] = {};
      state.lcc[idx].comments = comment.value;
      saveState();
    });
  });
}

function calculateFacilityAvailabilityScore() {
  const yes = n => (state.facility.availability[n] || {}).available === "Y";
  let points = 0;
  if (yes(1) || yes(2) || yes(3)) points += 1;
  [4,5,6,7,10,11,12,13,26,27,28,29,30,31,32,33,34].forEach(n => { if (yes(n)) points += 1; });
  [[8,9],[14,15],[16,17],[18,19],[20,21],[22,23],[24,25]].forEach(pair => {
    if (pair.every(yes)) points += 1;
  });
  return { points, denominator: 25, percent: Math.round((points / 25) * 100) };
}

function countThresholdForWard(ward) {
  const beds = Number(ward.profile.number_of_beds || 0);
  return beds > 0 ? Math.ceil(beds / 20) : 1;
}

function wardItem(ward, n) {
  return ward.readiness[n] || {};
}

function countPer20Always(ward, n) {
  const item = wardItem(ward, n);
  const threshold = countThresholdForWard(ward);
  return item.frequency === "Always" && Number(item.count_functioning || 0) >= threshold;
}

function observedYesAlways(ward, n) {
  const item = wardItem(ward, n);
  return item.observed === "Y" && item.frequency === "Always";
}

function observedYes(ward, n) {
  const item = wardItem(ward, n);
  return item.observed === "Y";
}

function calculateWardReadinessScore(ward) {
  let points = 0;
  let denominator = 28;

  [1,2,5].forEach(n => { if (countPer20Always(ward, n)) points += 1; });
  if (countPer20Always(ward, 3) && countPer20Always(ward, 4)) points += 1;

  [6,7,8,11,22,23,24,25,26,28,29,35].forEach(n => { if (observedYesAlways(ward, n)) points += 1; });
  [[9,10],[12,13],[14,15],[16,17],[18,19],[20,21]].forEach(pair => {
    if (pair.every(n => observedYesAlways(ward, n))) points += 1;
  });

  const oxytocin = wardItem(ward, 27);
  if (oxytocin.not_relevant) {
    denominator -= 1;
  } else if (observedYesAlways(ward, 27)) {
    points += 1;
  }

  [30,31,32].forEach(n => { if (observedYes(ward, n)) points += 1; });

  const patients = Number(ward.profile.number_of_patients || 0);
  const nurses = Number(wardItem(ward, 33).number || 0);
  if (patients > 0) {
    if (nurses > patients / 10) points += 1;
  } else if (nurses > 0) {
    points += 1;
  }

  if (Number(wardItem(ward, 34).number || 0) >= 1) points += 1;

  return { points, denominator, percent: denominator > 0 ? Math.round((points / denominator) * 100) : 0 };
}

function lccScores() {
  return lccQuestions.map((q, idx) => ({...q, index: idx, score: Number((state.lcc[idx] || {}).score)})).filter(x => Number.isFinite(x.score) && x.score >= 1 && x.score <= 5);
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a,b) => a + b, 0) / values.length;
}

function calculateLccSummary() {
  const scored = lccScores();
  const overall = mean(scored.map(x => x.score));
  const phase = {};
  const domains = { Legitimacy: [], Capability: [], Connectedness: [] };

  scored.forEach(item => {
    if (!phase[item.phase]) phase[item.phase] = [];
    phase[item.phase].push(item.score);
    const d = item.domain.toLowerCase();
    if (d.includes("legitimacy")) domains.Legitimacy.push(item.score);
    if (d.includes("capability")) domains.Capability.push(item.score);
    if (d.includes("connectedness")) domains.Connectedness.push(item.score);
  });

  const phaseMeans = Object.fromEntries(Object.entries(phase).map(([k,v]) => [k, mean(v)]));
  const domainMeans = Object.fromEntries(Object.entries(domains).map(([k,v]) => [k, mean(v)]));
  const lowItems = scored.filter(x => x.score <= 2);
  const earliestLow = lowItems.sort((a,b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase))[0] || null;

  return { scored, overall, phaseMeans, domainMeans, lowItems, earliestLow };
}

function updateDashboard() {
  if (!eecc || !lccQuestions) return;
  const availability = calculateFacilityAvailabilityScore();
  const wardScores = state.wards.map((ward, idx) => ({ idx, name: ward.name || ward.profile.ward_unit_name || `Ward/unit ${idx + 1}`, ...calculateWardReadinessScore(ward) }));
  const readinessMean = mean(wardScores.map(x => x.percent));
  const lcc = calculateLccSummary();

  const availabilityEl = document.getElementById("dashAvailability");
  if (availabilityEl) {
    availabilityEl.textContent = `${availability.percent}%`;
    document.getElementById("dashAvailabilityDetail").textContent = `${availability.points} / ${availability.denominator} points`;
  }

  const readinessEl = document.getElementById("dashReadiness");
  if (readinessEl) {
    readinessEl.textContent = readinessMean == null ? "—" : `${Math.round(readinessMean)}%`;
    document.getElementById("dashReadinessDetail").textContent = wardScores.length ? `Average of ${wardScores.length} ward/unit assessment(s)` : "No ward/unit assessments";
  }

  const lccMeanEl = document.getElementById("dashLccMean");
  if (lccMeanEl) {
    lccMeanEl.textContent = lcc.overall == null ? "—" : lcc.overall.toFixed(1);
    document.getElementById("dashLccDetail").textContent = `${lcc.scored.length} / ${lccQuestions.length} LCC items scored`;
  }

  const wardScoreTable = document.getElementById("wardScoreTable");
  if (wardScoreTable) {
    wardScoreTable.innerHTML = `<table><thead><tr><th>Ward/unit</th><th>Points</th><th>Denominator</th><th>Readiness score</th></tr></thead><tbody>${wardScores.map(w => `<tr><td>${escapeHtml(w.name)}</td><td>${w.points}</td><td>${w.denominator}</td><td>${w.percent}%</td></tr>`).join("")}</tbody></table>`;
  }

  const lccProfile = document.getElementById("lccProfile");
  if (lccProfile) {
    const phaseRows = Object.entries(lcc.phaseMeans).map(([phase, val]) => `<tr><td>${escapeHtml(phase)}</td><td>${val.toFixed(1)}</td></tr>`).join("");
    const domainRows = Object.entries(lcc.domainMeans).map(([domain, val]) => `<tr><td>${escapeHtml(domain)}</td><td>${val == null ? "—" : val.toFixed(1)}</td></tr>`).join("");
    const itemRows = lccQuestions.map((q, idx) => {
      const score = (state.lcc[idx] || {}).score;
      const rowClass = score <= 2 ? "low" : score === 3 ? "mid" : score >= 4 ? "high" : "";
      return `<tr class="${rowClass}"><td>${escapeHtml(q.phase)}</td><td>${escapeHtml(q.cmoc)}</td><td>${escapeHtml(q.prompt)}</td><td>${score || "—"}</td></tr>`;
    }).join("");
    lccProfile.innerHTML = `<div class="dashboard-grid"><div><h4>Phase means</h4><table><tbody>${phaseRows || `<tr><td>No scores entered</td></tr>`}</tbody></table></div><div><h4>Domain means</h4><table><tbody>${domainRows}</tbody></table></div></div><h4>CMOC items</h4><table><thead><tr><th>Phase</th><th>CMOC</th><th>Question</th><th>Score</th></tr></thead><tbody>${itemRows}</tbody></table>`;
  }

  const interpretation = document.getElementById("interpretation");
  if (interpretation) {
    let text = `<p><b>Resource interpretation:</b> Availability is ${availability.points}/25 (${availability.percent}%).`;
    if (readinessMean != null) text += ` Mean ward/bedside readiness is ${Math.round(readinessMean)}% across ${wardScores.length} ward/unit assessment(s).`;
    text += `</p>`;

    if (availability.percent < 80) {
      text += `<p><b>Initial diagnosis:</b> resource availability appears to be a major constraint. Prioritise facility-level resource gaps before over-interpreting LCC scores.</p>`;
    } else if (readinessMean != null && readinessMean < 80) {
      text += `<p><b>Initial diagnosis:</b> resources may exist somewhere in the facility, but ward/bedside readiness appears incomplete. Prioritise point-of-care access, function, night availability, and ward-level systems.</p>`;
    } else {
      text += `<p><b>Initial diagnosis:</b> EECC availability/readiness appear relatively strong. If care remains delayed or unreliable, LCC contextual conditions are likely to explain part of the gap.</p>`;
    }

    if (lcc.earliestLow) {
      text += `<p><b>Earliest low LCC phase:</b> ${escapeHtml(lcc.earliestLow.phase)} — ${escapeHtml(lcc.earliestLow.cmoc)}: ${escapeHtml(lcc.earliestLow.prompt)}. This should be considered an early priority because earlier phase failures can compromise later care.</p>`;
    }
    if (lcc.lowItems.length) {
      text += `<p><b>Major contextual barriers:</b> ${lcc.lowItems.map(x => `${escapeHtml(x.phase)} ${escapeHtml(x.cmoc)} (${escapeHtml(x.domain)})`).join("; ")}.</p>`;
    }
    interpretation.innerHTML = text;
  }
}

function download(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes("\n") || s.includes('"')) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function makeSummaryCsv() {
  const rows = [];
  const availability = calculateFacilityAvailabilityScore();
  rows.push(["section", "name", "points_or_score", "denominator", "percent_or_mean"]);
  rows.push(["facility_availability", "Availability", availability.points, availability.denominator, availability.percent]);
  state.wards.forEach((ward, idx) => {
    const s = calculateWardReadinessScore(ward);
    rows.push(["ward_readiness", ward.name || `Ward/unit ${idx + 1}`, s.points, s.denominator, s.percent]);
  });
  const lcc = calculateLccSummary();
  rows.push(["lcc", "Mean", "", "", lcc.overall == null ? "" : lcc.overall.toFixed(2)]);
  lccQuestions.forEach((q, idx) => rows.push(["lcc_item", `${q.phase} ${q.cmoc}`, state.lcc[idx]?.score || "", "", q.prompt]));
  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

function bindGlobalControls() {
  document.querySelectorAll(".nav-button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".page").forEach(page => page.hidden = true);
      document.getElementById(btn.dataset.page).hidden = false;
      updateDashboard();
    });
  });

  document.getElementById("wardSelect").addEventListener("change", (e) => {
    activeWardIndex = Number(e.target.value);
    renderWardSelect();
    renderWardProfile();
    renderWardReadiness();
  });

  document.getElementById("addWard").addEventListener("click", () => {
    state.wards.push(newWard(`Ward/unit ${state.wards.length + 1}`));
    activeWardIndex = state.wards.length - 1;
    saveState();
    renderWardSelect();
    renderWardProfile();
    renderWardReadiness();
  });

  document.getElementById("duplicateWard").addEventListener("click", () => {
    const copy = JSON.parse(JSON.stringify(getWard()));
    copy.id = `ward_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    copy.name = `${copy.name || copy.profile.ward_unit_name || "Ward/unit"} copy`;
    copy.profile.ward_unit_name = copy.name;
    state.wards.push(copy);
    activeWardIndex = state.wards.length - 1;
    saveState();
    renderWardSelect();
    renderWardProfile();
    renderWardReadiness();
  });

  document.getElementById("deleteWard").addEventListener("click", () => {
    if (state.wards.length <= 1) {
      alert("At least one ward/unit assessment is required.");
      return;
    }
    if (!confirm("Delete the current ward/unit assessment?")) return;
    state.wards.splice(activeWardIndex, 1);
    activeWardIndex = Math.max(0, activeWardIndex - 1);
    saveState();
    renderWardSelect();
    renderWardProfile();
    renderWardReadiness();
  });

  document.getElementById("saveNowResources").addEventListener("click", () => { saveState(); alert("Saved in this browser."); });
  document.getElementById("saveNowLcc").addEventListener("click", () => { saveState(); alert("Saved in this browser."); });
  document.getElementById("downloadJson").addEventListener("click", () => download("facility-diagnostic-tool-data.json", JSON.stringify(state, null, 2), "application/json"));
  document.getElementById("downloadCsv").addEventListener("click", () => download("facility-diagnostic-tool-summary.csv", makeSummaryCsv(), "text/csv"));
  document.getElementById("clearAll").addEventListener("click", () => {
    if (confirm("Clear all saved data in this browser?")) {
      localStorage.removeItem(STORE_KEY);
      state = defaultState();
      activeWardIndex = 0;
      renderAll();
    }
  });
}

function renderAll() {
  renderFacilityProfile();
  renderFacilityAvailability();
  renderWardSelect();
  renderWardProfile();
  renderWardReadiness();
  renderLcc();
  updateDashboard();
}

Promise.all([
  fetch("data/eecc_part1_availability_readiness.json").then(r => r.json()),
  fetch("data/lcc_questions.json").then(r => r.json())
]).then(([eeccData, lccData]) => {
  eecc = eeccData;
  lccQuestions = lccData;
  bindGlobalControls();
  renderAll();
}).catch(error => {
  document.body.insertAdjacentHTML("afterbegin", `<div class="instruction-box"><b>Error loading tool data:</b> ${escapeHtml(error.message)}</div>`);
  console.error(error);
});
