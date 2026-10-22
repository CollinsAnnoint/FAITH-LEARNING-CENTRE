/**
 * Home page design system test for FAITH LEARNING CENTRE
 * Verifies: all seven home page designs render with live data, the design picker
 * persists the choice on the backend, the ?design=N preview override works, and the
 * /designs chooser page builds its seven comparison cards.
 *
 * Usage: node tests/homes.test.js   (requires the server running on PORT 3000)
 */
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PUBLIC = path.join(__dirname, "..", "public");
const errors = [];

function boot(pageFile, urlPath) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(fs.readFileSync(path.join(PUBLIC, pageFile), "utf8"), {
    url: BASE + urlPath,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;
  window.fetch = (u, o) => fetch(new URL(u, BASE).toString(), o);
  window.scrollTo = () => {};
  window.print = () => {};
  window.confirm = () => true;
  window.URL.createObjectURL = () => "blob:test";
  vc.on("jsdomError", (e) => {
    if (!/scrollTo|Not implemented|Could not parse CSS/.test(e.message)) errors.push(pageFile + " jsdomError: " + e.message);
  });
  vc.on("error", (m) => errors.push(pageFile + " console.error: " + m));
  return window;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function loadScripts(w, files) {
  for (const f of files) {
    try { w.eval(fs.readFileSync(path.join(PUBLIC, f), "utf8")); }
    catch (e) { errors.push("eval " + f + ": " + e.message); }
  }
}

const HOOKS = {
  "2": [".hs-split-panel", ".hs-hero-split", ".hs-split-photo"],
  "3": [".hs-masthead", ".hs-banner"],
  "4": [".hs-minimal-card", ".hs-minimal-photo"],
  "5": [".hs-bento-grid", ".hs-bento-tile"],
  "6": [".hs-hero-dark", ".hs-dark-photos"],
  "7": [".hs-hero-admissions", ".hs-apply-bar", "#fees"]
};

async function testDesigns() {
  const w = boot("index.html", "/");
  loadScripts(w, ["app.js", "terms.js", "landing.js", "homes.js"]);
  await wait(1600);

  if (!w.Homes) { errors.push("homes: window.Homes was not exposed"); return; }
  if (String(w.__flcRenderedDesign) !== "1") errors.push("homes: default render was not design 1 (got " + w.__flcRenderedDesign + ")");
  if (!w.document.getElementById("landing-root").innerHTML.includes("hero-dim")) {
    errors.push("homes: design 1 (landing.js) did not render");
  }

  for (const id of ["2", "3", "4", "5", "6", "7"]) {
    w.Homes.renderDesign(id);
    const root = w.document.getElementById("landing-root");
    const html = root.innerHTML;
    if (!root.querySelector(".d" + id)) errors.push("homes: design " + id + " root class missing");
    HOOKS[id].forEach((sel) => {
      if (!root.querySelector(sel)) errors.push("homes: design " + id + " missing " + sel);
    });
    if (!root.querySelector("#hs-header")) errors.push("homes: design " + id + " has no header");
    if (!root.querySelector(".hs-footer")) errors.push("homes: design " + id + " has no footer");
    if (!root.querySelector(".hs-shot")) errors.push("homes: design " + id + " has no gallery");
    if (!w.document.getElementById("enq-terms-" + id)) errors.push("homes: design " + id + " enquiry form lacks the Terms checkbox");
    if (!html.includes("FLCTerms.open")) errors.push("homes: design " + id + " has no Terms & Conditions link");
    if (!html.includes("/assets/")) errors.push("homes: design " + id + " uses no school photography");
    const counts = Array.from(root.querySelectorAll("[data-count]")).map((el) => Number(el.dataset.count));
    if (counts.filter((n) => n > 0).length < 3) errors.push("homes: design " + id + " stats are not driven by live data");
    if (/#(8b5cf6|a855f7|7c3aed|6366f1|4f46e5|9333ea|d946ef|ec4899)/i.test(html)) {
      errors.push("homes: design " + id + " contains an unprofessional purple tone");
    }
    if (String(w.__flcRenderedDesign) !== id) errors.push("homes: design " + id + " did not register as rendered");
  }

  // design 7 must carry the fee table with real figures from the finance config
  w.Homes.renderDesign("7");
  const seven = w.document.getElementById("landing-root").innerHTML;
  if (!/44,000|44000/.test(seven)) errors.push("homes: design 7 fee table is missing the JSS day fee");
  if (!seven.includes("M-Pesa") && !seven.includes("Paybill")) errors.push("homes: design 7 fee table lacks payment instructions");

  // enquiry form on a variant design enforces the Terms checkbox
  w.Homes.renderDesign("5");
  w.document.getElementById("enq-parent-5").value = "Design Test Parent";
  w.document.getElementById("enq-phone-5").value = "+254700333444";
  await w.Homes.submitEnquiry({ preventDefault() {} }, "5");
  if (w.document.getElementById("enq-card-5").innerHTML.includes("Enquiry received")) {
    errors.push("homes: design 5 enquiry submitted without accepting the Terms");
  }
  w.document.getElementById("enq-terms-5").checked = true;
  await w.Homes.submitEnquiry({ preventDefault() {} }, "5");
  await wait(500);
  if (!w.document.getElementById("enq-card-5").innerHTML.includes("Enquiry received")) {
    errors.push("homes: design 5 enquiry did not submit after accepting the Terms");
  }

  // switching back to design 1 must restore the landing renderer
  w.Homes.renderDesign("1");
  if (!w.document.getElementById("landing-root").innerHTML.includes("hero-dim")) {
    errors.push("homes: could not switch back to design 1");
  }
  console.log("✓ All seven home page designs render with live data, photos, Terms links and enquiry gates");
}

async function testOverride() {
  const w = boot("index.html", "/preview?design=6");
  loadScripts(w, ["app.js", "terms.js", "landing.js", "homes.js"]);
  await wait(1600);
  if (String(w.__flcRenderedDesign) !== "6") {
    errors.push("homes: ?design=6 preview did not render design 6 (got " + w.__flcRenderedDesign + ")");
  }
  if (!w.document.querySelector(".d6 .hs-hero-dark")) errors.push("homes: ?design=6 preview is missing the dark hero");
  try { if (w.localStorage.getItem("flc_home_design") !== "6") errors.push("homes: chosen design was not remembered in localStorage"); }
  catch (e) {}
  console.log("✓ ?design=N preview override renders the requested design without touching the live setting");
}

async function testChooser() {
  const w = boot("designs.html", "/designs");
  w.fetch = (u, o) => fetch(new URL(u, BASE).toString(), o);
  loadScripts(w, ["app.js", "terms.js", "landing.js", "homes.js"]);
  // the chooser logic is inline in designs.html
  const src = fs.readFileSync(path.join(PUBLIC, "designs.html"), "utf8");
  const inline = src.slice(src.lastIndexOf("<script>") + 8, src.lastIndexOf("</script>"));
  try { w.eval(inline); } catch (e) { errors.push("chooser eval: " + e.message); }
  await wait(1200);

  const cards = w.document.querySelectorAll(".design-card");
  if (cards.length !== 7) errors.push("chooser: expected 7 design cards, found " + cards.length);
  const names = Array.from(cards).map((c) => c.querySelector("h3").textContent.trim());
  ["Classic Heritage", "Split Panel", "Editorial Broadsheet", "Minimal Corporate", "Bento Mosaic", "Premium Dark", "Admissions Focused"]
    .forEach((n) => { if (!names.includes(n)) errors.push("chooser: card missing for " + n); });
  if (!w.document.querySelector(".design-mock .mock")) errors.push("chooser: miniature previews were not drawn");
  if (w.document.querySelectorAll(".design-card a[href^='/preview?design=']").length !== 7) {
    errors.push("chooser: every card must offer a full-size preview link");
  }
  if (!/Live design/.test(w.document.getElementById("current-design-label").textContent)) {
    errors.push("chooser: live design label was not filled in");
  }

  // picking a design must persist on the backend
  await w.Chooser.use("4");
  await wait(400);
  const after = await fetch(BASE + "/api/config/home-design").then((r) => r.json());
  if (after.design !== "4") errors.push("chooser: picking a design did not persist on the backend (got " + after.design + ")");
  const boot2 = await fetch(BASE + "/api/bootstrap").then((r) => r.json());
  if (String(boot2.systemConfig.branding.homeDesign) !== "4") errors.push("chooser: branding.homeDesign was not updated");
  if (!w.document.querySelector(".design-card.active")) errors.push("chooser: the live design is not marked as active");
  // hand the live site back to design 1 for the remaining checks
  await fetch(BASE + "/api/config/home-design", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ design: "1" })
  });
  console.log("✓ /designs chooser lists all seven designs and the pick persists on the backend");
}

async function testApi() {
  const res = await fetch(BASE + "/api/config/home-design").then((r) => r.json());
  if (!res.ok || !Array.isArray(res.designs) || res.designs.length !== 7) errors.push("api: /api/config/home-design did not list 7 designs");
  const bad = await fetch(BASE + "/api/config/home-design", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ design: "42" })
  });
  if (bad.status !== 400) errors.push("api: invalid design id was not rejected");
  const page = await fetch(BASE + "/designs").then((r) => r.text());
  if (!page.includes("design-grid")) errors.push("api: /designs is not served by the backend");
  const preview = await fetch(BASE + "/preview?design=2").then((r) => r.text());
  if (!preview.includes("landing-root")) errors.push("api: /preview does not serve the home page shell");
  // restore the live choice to design 1
  await fetch(BASE + "/api/config/home-design", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ design: "1" })
  });
  const back = await fetch(BASE + "/api/config/home-design").then((r) => r.json());
  if (back.design !== "1") errors.push("api: could not restore design 1 after the test");
  console.log("✓ Home design API, /designs route and /preview route verified (live design restored to 1)");
}

(async () => {
  await testApi();
  await testChooser();
  await testDesigns();
  await testOverride();
  if (errors.length) {
    console.log("\n❌ FAILURES (" + errors.length + "):");
    errors.forEach((e) => console.log(" - " + e));
    process.exit(1);
  }
  console.log("\n✅ Seven home page designs, chooser and design API all passed.");
  process.exit(0);
})().catch((e) => { console.error("test crashed:", e); process.exit(1); });
