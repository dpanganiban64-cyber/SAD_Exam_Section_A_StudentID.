"use strict";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let db,
  sessionUser,
  profile,
  scholar,
  policies = [],
  scholars = [],
  submissions = [],
  audit = [];
function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("error-toast", err);
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}
function tag(v) {
  let c = ["Compliant", "Verified", "Approved"].includes(v)
    ? "good"
    : ["With Deficiency", "Returned", "Held"].includes(v)
      ? "bad"
      : ["Pending", "Not Evaluated"].includes(v)
        ? "warn"
        : "";
  return `<span class="tag ${c}">${esc(v || "Pending")}</span>`;
}
function showLogin() {
  $("#loginView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
  $("#logoutBtn").classList.add("hidden");
}
function fail(e) {
  console.error(e);
  toast(e.message || "Unexpected error", true);
}
async function init() {
  if (
    !window.supabase ||
    !window.SUPABASE_URL ||
    window.SUPABASE_URL.includes("YOUR_PROJECT_ID") ||
    !window.SUPABASE_ANON_KEY ||
    window.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
  ) {
    showLogin();
    $("#loginError").textContent =
      "Configure public/config.js with your Supabase project URL and publishable/anon key first.";
    return;
  }
  db = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
  );
  const {
    data: { session },
  } = await db.auth.getSession();
  if (session) await loadApp(session.user);
  else showLogin();
  db.auth.onAuthStateChange((_event, s) => {
    if (!s) {
      sessionUser = null;
      showLogin();
    }
  });
}
async function loadApp(user) {
  sessionUser = user;
  const { data: p, error } = await db
    .from("user_profile")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (error)
    throw new Error(
      "Your Auth account has no user_profile role. Ask staff to assign it in Supabase.",
    );
  profile = p;
  const { data: pol, error: pe } = await db
    .from("scholarship_policy")
    .select("*")
    .order("policy_name");
  if (pe) throw pe;
  policies = pol || [];
  if (profile.role === "scholar") {
    const { data: s, error: se } = await db
      .from("scholar")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (se) throw new Error("No scholar record is linked to your account.");
    scholar = s;
  }
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#logoutBtn").classList.remove("hidden");
  $("#userPill").textContent = profile.full_name || user.email;
  $("#roleLabel").textContent =
    profile.role === "staff" ? "STAFF WORKSPACE" : "SCHOLAR WORKSPACE";
  $("#welcomeTitle").textContent =
    profile.role === "staff" ? "Scholarship dashboard" : "My scholarship";
  $("#welcomeText").textContent =
    profile.role === "staff"
      ? "Monitor submissions, apply policy checks, and document decisions."
      : "Submit academic summaries and follow verification and compliance status.";
  $("#staffDashboard").classList.toggle("hidden", profile.role !== "staff");
  $("#scholarView").classList.toggle("hidden", profile.role !== "scholar");
  if (profile.role === "staff") {
    const sel = $("#programFilter");
    sel.innerHTML =
      '<option value="">All programs</option>' +
      policies
        .map(
          (x) =>
            `<option value="${esc(x.policy_id)}">${esc(x.policy_name)}</option>`,
        )
        .join("");
    await loadStaff();
  } else await loadScholar();
}
async function loadStaff() {
  let [sr, ar, pr] = await Promise.all([
    db
      .from("scholar")
      .select(
        "*, user_profile(full_name,email), scholarship_policy(policy_name)",
      )
      .order("full_name"),
    db
      .from("audit_history")
      .select("*, user_profile(full_name)")
      .order("occurred_at", { ascending: false })
      .limit(20),
    db
      .from("semester_submission")
      .select(
        "*, scholar(scholar_id,student_id,full_name,policy_id,scholarship_policy(policy_name))",
      )
      .eq("academic_year", "2026-2027")
      .order("submitted_at", { ascending: false }),
  ]);
  if (sr.error) throw sr.error;
  if (ar.error) throw ar.error;
  if (pr.error) throw pr.error;
  scholars = sr.data || [];
  audit = ar.data || [];
  submissions = pr.data || [];
  renderStaff();
}
function renderStaff() {
  let term = $("#semesterFilter").value,
    search = $("#searchInput").value.toLowerCase(),
    prog = $("#programFilter").value,
    comp = $("#complianceFilter").value;
  let filtered = submissions.filter(
    (s) =>
      s.semester === term &&
      (!search ||
        `${s.scholar?.full_name || ""} ${s.scholar?.student_id || ""}`
          .toLowerCase()
          .includes(search)) &&
      (!prog || s.scholar?.policy_id === prog) &&
      (!comp || s.compliance_status === comp),
  );
  $("#submissionRows").innerHTML =
    filtered
      .map(
        (s) =>
          `<tr><td><b>${esc(s.scholar?.full_name)}</b><small>${esc(s.scholar?.student_id)}</small></td><td>${esc(s.scholar?.scholarship_policy?.policy_name || "—")}</td><td>${esc(s.academic_year)} / ${esc(s.semester)}</td><td>${Number(s.gwa).toFixed(2)}</td><td>${tag(s.verification_status)}</td><td>${tag(s.compliance_status)}${(s.deficiency_reasons || []).length ? `<div class="reason">${esc(s.deficiency_reasons.join("; "))}</div>` : ""}</td><td>${tag(s.renewal_decision)}</td><td><div class="action-row"><button class="secondary" data-a="verify" data-id="${s.submission_id}">Verify</button><button class="secondary" data-a="evaluate" data-id="${s.submission_id}">Evaluate</button><button class="secondary" data-a="decision" data-id="${s.submission_id}">Decision</button></div></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="8">No submissions match these filters.</td></tr>';
  const all = submissions.filter((s) => s.semester === term);
  $("#stats").innerHTML = [
    ["Assigned scholars", scholars.length],
    [
      "Pending verification",
      all.filter((s) => s.verification_status === "Pending").length,
    ],
    [
      "Compliant",
      all.filter((s) => s.compliance_status === "Compliant").length,
    ],
    [
      "With deficiency",
      all.filter((s) => s.compliance_status === "With Deficiency").length,
    ],
  ]
    .map(
      ([a, b]) =>
        `<div class="stat"><small>${a}</small><strong>${b}</strong></div>`,
    )
    .join("");
  $("#auditList").innerHTML =
    audit
      .map(
        (a) =>
          `<div class="audit-item"><b>${esc(a.action)} · ${esc(a.entity_id)}</b><div>${esc(a.details)}</div><div class="muted">${esc(a.user_profile?.full_name || "Staff")} · ${new Date(a.occurred_at).toLocaleString()}</div></div>`,
      )
      .join("") || '<p class="muted">No activity yet.</p>';
}
async function loadScholar() {
  const { data, error } = await db
    .from("semester_submission")
    .select("*")
    .eq("scholar_id", scholar.scholar_id)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  submissions = data || [];
  $("#scholarStats").innerHTML = [
    ["My submissions", submissions.length],
    [
      "Pending verification",
      submissions.filter((s) =>
        ["Pending", "Returned"].includes(s.verification_status),
      ).length,
    ],
    [
      "Compliant",
      submissions.filter((s) => s.compliance_status === "Compliant").length,
    ],
    [
      "With deficiency",
      submissions.filter((s) => s.compliance_status === "With Deficiency")
        .length,
    ],
  ]
    .map(
      ([a, b]) =>
        `<div class="stat"><small>${a}</small><strong>${b}</strong></div>`,
    )
    .join("");
  $("#mySubmissions").innerHTML =
    submissions
      .map(
        (s) =>
          `<article class="submission-card"><h3>${esc(s.academic_year)} · Semester ${esc(s.semester)}</h3><p>GWA: <b>${Number(s.gwa).toFixed(2)}</b> · Units: ${s.enrolled_units}</p><p>Verification: ${tag(s.verification_status)}</p><p>Compliance: ${tag(s.compliance_status)}</p><p>Renewal: ${tag(s.renewal_decision)}</p><p>Evidence: ${esc(s.evidence_reference)}</p>${s.verification_reason ? `<p class="reason">Staff note: ${esc(s.verification_reason)}</p>` : ""}${(s.deficiency_reasons || []).length ? `<p class="reason">${esc(s.deficiency_reasons.join("; "))}</p>` : ""}${s.verification_status === "Returned" ? `<button class="primary" data-a="correct" data-id="${s.submission_id}">Correct and resubmit</button>` : ""}</article>`,
      )
      .join("") ||
    '<p class="muted">You have not submitted a semester summary yet.</p>';
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginError").textContent = "";
  const f = Object.fromEntries(new FormData(e.currentTarget));
  try {
    const { data, error } = await db.auth.signInWithPassword({
      email: f.email,
      password: f.password,
    });
    if (error) throw error;
    await loadApp(data.user);
  } catch (err) {
    $("#loginError").textContent = err.message;
  }
});
$("#logoutBtn").addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  showLogin();
});
$("#submissionForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.currentTarget));
  const n = ["gwa", "units", "failed", "incomplete", "dropped"];
  n.forEach((k) => (f[k] = Number(f[k])));
  if (
    f.gwa < 1 ||
    f.gwa > 5 ||
    n.slice(1).some((k) => !Number.isInteger(f[k]) || f[k] < 0)
  ) {
    $("#submitMessage").textContent =
      "Enter a GWA from 1.00 to 5.00 and nonnegative whole-number counts/units.";
    return;
  }
  try {
    const { error } = await db
      .from("semester_submission")
      .insert({
        scholar_id: scholar.scholar_id,
        academic_year: f.academicYear,
        semester: f.semester,
        gwa: f.gwa,
        enrolled_units: f.units,
        failed_count: f.failed,
        incomplete_count: f.incomplete,
        dropped_count: f.dropped,
        evidence_reference: f.evidenceRef,
      });
    if (error) throw error;
    $("#submitMessage").textContent =
      "Submission saved. Status: Pending verification.";
    e.currentTarget.reset();
    e.currentTarget.elements.academicYear.value = "2026-2027";
    await loadScholar();
    toast("Academic summary submitted.");
  } catch (err) {
    $("#submitMessage").textContent =
      err.code === "23505"
        ? "A submission already exists for this academic year and semester."
        : err.message;
    $("#submitMessage").style.color = "#b42318";
  }
});
["searchInput", "programFilter", "complianceFilter", "semesterFilter"].forEach(
  (id) =>
    $("#" + id).addEventListener(
      "input",
      () => profile?.role === "staff" && renderStaff(),
    ),
);
function modal(title, html) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
function closeModal() {
  $("#modal").classList.add("hidden");
  $("#modalBody").innerHTML = "";
}
$("#closeModal").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
$("#showRegister").addEventListener("click", async () => {
  try {
    const { data: users, error } = await db
      .from("user_profile")
      .select("user_id,email,full_name")
      .eq("role", "scholar")
      .order("email");
    if (error) throw error;
    const { data: linked, error: le } = await db
      .from("scholar")
      .select("user_id");
    if (le) throw le;
    const used = new Set((linked || []).map((x) => x.user_id));
    const available = (users || []).filter((x) => !used.has(x.user_id));
    if (!available.length) {
      toast(
        "Create the scholar account in Supabase Authentication first, then try again.",
        true,
      );
      return;
    }
    modal(
      "Assign scholar account",
      `<form id="assignForm"><label>Supabase scholar account<select name="user_id" required>${available.map((u) => `<option value="${u.user_id}">${esc(u.email)}${u.full_name ? " — " + esc(u.full_name) : ""}</option>`).join("")}</select></label><label>Student ID<input name="student_id" required></label><label>Full name<input name="full_name" required></label><label>Email<input name="email" type="email" required></label><label>Scholarship program<select name="policy_id">${policies.map((p) => `<option value="${p.policy_id}">${esc(p.policy_name)}</option>`).join("")}</select></label><button class="primary">Save scholar assignment</button></form>`,
    );
    $("#assignForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.currentTarget));
      const { error } = await db.from("scholar").insert(f);
      if (error) throw error;
      closeModal();
      await loadStaff();
      toast("Scholar assigned successfully.");
    });
  } catch (err) {
    fail(err);
  }
});
$("#submissionRows").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-a]");
  if (!b) return;
  const s = submissions.find((x) => x.submission_id === b.dataset.id);
  if (!s) return;
  try {
    if (b.dataset.a === "verify") {
      modal(
        "Verify evidence",
        `<form id="actForm"><label>Result<select name="status"><option>Verified</option><option>Returned</option></select></label><label>Reason / note<textarea name="reason" rows="3">${esc(s.verification_reason || "")}</textarea></label><button class="primary">Save verification</button></form>`,
      );
      $("#actForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = Object.fromEntries(new FormData(ev.currentTarget));
        const { error } = await db.rpc("staff_verify_submission", {
          p_submission_id: s.submission_id,
          p_status: f.status,
          p_reason: f.reason,
        });
        if (error) throw error;
        closeModal();
        await loadStaff();
        toast("Verification updated.");
      });
    } else if (b.dataset.a === "evaluate") {
      const { error } = await db.rpc("evaluate_compliance", {
        p_submission_id: s.submission_id,
      });
      if (error) throw error;
      await loadStaff();
      toast("Compliance evaluation saved.");
    } else if (b.dataset.a === "decision") {
      modal(
        "Renewal decision",
        `<p>Compliance: ${tag(s.compliance_status)}</p><form id="actForm"><label>Decision<select name="decision"><option>Approved</option><option>Held</option></select></label><label>Decision note<textarea name="note" rows="3">${esc(s.decision_note || "")}</textarea></label><button class="primary">Save decision</button></form>`,
      );
      $("#actForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = Object.fromEntries(new FormData(ev.currentTarget));
        const { error } = await db.rpc("staff_record_renewal_decision", {
          p_submission_id: s.submission_id,
          p_decision: f.decision,
          p_note: f.note,
        });
        if (error) throw error;
        closeModal();
        await loadStaff();
        toast("Renewal decision saved.");
      });
    }
  } catch (err) {
    fail(err);
  }
});
$("#mySubmissions").addEventListener("click", (e) => {
  const b = e.target.closest('button[data-a="correct"]');
  if (!b) return;
  const s = submissions.find((x) => x.submission_id === b.dataset.id);
  if (!s) return;
  modal(
    "Correct and resubmit",
    `<form id="correctForm" class="form-grid"><label>Academic year<input name="academicYear" value="${esc(s.academic_year)}" required></label><label>Semester<select name="semester"><option value="1" ${s.semester === "1" ? "selected" : ""}>Semester 1</option><option value="2" ${s.semester === "2" ? "selected" : ""}>Semester 2</option><option value="Summer" ${s.semester === "Summer" ? "selected" : ""}>Summer</option></select></label><label>GWA<input name="gwa" type="number" min="1" max="5" step=".01" value="${s.gwa}" required></label><label>Units<input name="units" type="number" min="0" value="${s.enrolled_units}" required></label><label>Failed<input name="failed" type="number" min="0" value="${s.failed_count}" required></label><label>Incomplete<input name="incomplete" type="number" min="0" value="${s.incomplete_count}" required></label><label>Dropped<input name="dropped" type="number" min="0" value="${s.dropped_count}" required></label><label>Evidence reference<input name="evidenceRef" value="${esc(s.evidence_reference)}" required></label><button class="primary">Resubmit correction</button></form>`,
  );
  $("#correctForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.currentTarget));
    try {
      const { error } = await db.rpc("resubmit_correction", {
        p_submission_id: s.submission_id,
        p_academic_year: f.academicYear,
        p_semester: f.semester,
        p_gwa: Number(f.gwa),
        p_units: Number(f.units),
        p_failed: Number(f.failed),
        p_incomplete: Number(f.incomplete),
        p_dropped: Number(f.dropped),
        p_evidence_reference: f.evidenceRef,
      });
      if (error) throw error;
      closeModal();
      await loadScholar();
      toast("Corrected submission is pending verification.");
    } catch (err) {
      fail(err);
    }
  });
});
init().catch(fail);
