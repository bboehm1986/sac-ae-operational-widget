/*
    AE Operations — SAC Custom Widget

    Split off from the original "AE Snap Report" widget on 2026-09-13, per
    Blair: teams on the ground need actionable, granular working detail,
    distinct from the leadership "at a glance" view (see the sibling
    sac-ae-executive-widget project). Both widgets bind to the SAME
    underlying model (AM_EMPLOYER_ENROLLMENT_SUMMARY) rather than two
    separate cubes. See BUILD_PLAN_VWEMPLOYERSAVES.md in the
    sac-ae-snap-report-widget folder, "Dashboard split", for the full
    reasoning and the combined-cube SQL both widgets share, including the
    3 new row-kinds added specifically for this widget (Multiple Attempts,
    Stalled-time buckets, Recently Completed) and, added 2026-09-14, the
    Status x Eligible Employee Band row-kind (see "Operational — employer-
    size focus" in that same doc).

    Data binding (declared in widget.json), following SAC's standard
    ResultSet row shape — same shape as the original widget's
    employerStatus binding, with 4 additional row-kinds this widget reads
    that the Executive widget ignores:

      - employerStatus  <- DS_EMPLOYER_ENROLLMENT_SUMMARY /
                            AM_EMPLOYER_ENROLLMENT_SUMMARY
            dimensions_0 = Status (Success / Abandoned / Not Started /
                            In Progress / Needs Follow-up / "" for
                            election-type, HSA, operational, or timeline
                            rows) — populated ALONGSIDE dimensions_2 only
                            on the Status x Band row-kind (added
                            2026-09-14); every other row-kind leaves one
                            of the two blank.
            dimensions_1 = Synod/Region ("" for non-geography rows)
            dimensions_2 = Election_Category — carries several different
                            "kinds" of value (see dimensions_4 to
                            disambiguate the health-plan ones):
                              - a Health_Plan_Bundle name (Year populated)
                              - "HSA Annual/One Time - Elected 0/>0"
                              - "Multiple Attempts" — employers whose
                                vEmployerSaves has more than one attempt
                                row (added 2026-09-13)
                              - "Stalled 0-3 Days" / "Stalled 4-7 Days" /
                                "Stalled 8+ Days" — non-completed
                                employers bucketed by days since their
                                last attempt (added 2026-09-13, rescaled
                                2026-09-16 — the original 0-7/8-14/15+
                                scheme barely differentiated anything
                                within the real ~14-day AE window, since
                                "15+" is nearly unreachable inside it)
                              - "Recently Completed" — completed in the
                                last 2 days (added 2026-09-13)
                              - "20+" / "10-19" / "3-9" / "Under 3" /
                                "Unknown" — Eligible Employee Band,
                                paired with a real dimensions_0 Status on
                                the SAME row (added 2026-09-14; see
                                BAND_ORDER)
                              - "" for plain status/synod/timeline rows
                            This widget ignores (but safely tolerates) the
                            YoY-only "Eligible Count" row-kind and the 2026
                            side of the health-plan buckets — it has no YoY
                            panel.
            dimensions_3 = Date (Completed_Date; "" for all other row-
                            kinds) — Timeline data.
            dimensions_4 = Year — populated only on Health_Plan_Bundle
                            rows; "" on every other row-kind, including all
                            4 operational-only ones.
            measures_0   = Employer Count
            measures_1   = Employee Count on Status/Synod rows (unused
                            elsewhere in this widget)

    Until wired to the real Datasphere-backed model, the widget renders
    from the MOCK_* constants below so the layout can be built and
    reviewed standalone (see preview.html).

    The Table+Export download experience (bound to
    AM_EMPLOYER_ENROLLMENT_DETAIL) is a separate native SAC Table widget,
    not part of this custom widget — it just needs to sit on the same
    Story page as this widget. See "Download experience" in
    BUILD_PLAN_VWEMPLOYERSAVES.md.

    No in-widget filter controls by design: SAC's Optimized-story View mode
    doesn't deliver internal click/change events to a custom widget's shadow
    DOM (confirmed on the original widget — see its README "Known
    limitation"). Filtering belongs in SAC's native Input Control instead.
*/
(function () {
    "use strict";

    const COMPLETED_STATUSES = ["Success"];
    const DEFAULTED_STATUSES = []; // no real "Defaulted" status value exists yet
    const OPEN_STATUSES = ["Abandoned", "Not Started", "In Progress", "Needs Follow-up"];
    const STALLED_BUCKET_ORDER = ["Stalled 0-3 Days", "Stalled 4-7 Days", "Stalled 8+ Days"];
    // Eligible Employee Band — mutually-exclusive tiers, confirmed by Blair
    // 2026-09-14 (not overlapping "3+/10+/20+" flags). "Unknown" covers
    // employers with no matching row in vEmployerEligibleCount. Largest-first
    // order, since the size-aware panel is meant to prioritize attention.
    const BAND_ORDER = ["20+", "10-19", "3-9", "Under 3", "Unknown"];

    function row(dims, measures) {
        const out = {};
        dims.forEach((d, i) => { out["dimensions_" + i] = { id: d, label: d }; });
        measures.forEach((m, i) => { out["measures_" + i] = { raw: m, formatted: String(m) }; });
        return out;
    }

    const MOCK_EMPLOYER_STATUS = { data: [
        row(["Success", "Southwestern Minnesota", "", "", ""], [53, 265]),
        row(["Not Started", "Southwestern Minnesota", "", "", ""], [5, 20]),
        row(["In Progress", "Southwestern Minnesota", "", "", ""], [2, 10]),
        row(["Abandoned", "Southwestern Minnesota", "", "", ""], [3, 12]),
        row(["Needs Follow-up", "Southwestern Minnesota", "", "", ""], [2, 8]),
        row(["Success", "Metropolitan Chicago", "", "", ""], [36, 361]),
        row(["Not Started", "Metropolitan Chicago", "", "", ""], [8, 50]),
        row(["In Progress", "Metropolitan Chicago", "", "", ""], [4, 25]),
        row(["Abandoned", "Metropolitan Chicago", "", "", ""], [2, 9]),
        row(["Needs Follow-up", "Metropolitan Chicago", "", "", ""], [2, 13]),
        row(["Success", "Southeastern Synod", "", "", ""], [18, 120]),
        row(["Not Started", "Southeastern Synod", "", "", ""], [4, 20]),
        row(["In Progress", "Southeastern Synod", "", "", ""], [3, 13]),
        row(["Abandoned", "Southeastern Synod", "", "", ""], [1, 4]),
        // Health-plan bucket breakdown — 2027 drives the Election Type
        // panel; 2026 added 2026-09-16 as the Timeline's % denominator
        // (this widget has no YoY panel to show it in directly).
        row(["", "", "Value Copay", "", "2027"], [42]),
        row(["", "", "Select Copay", "", "2027"], [31]),
        row(["", "", "Value HDHP", "", "2027"], [22]),
        row(["", "", "Select HDHP", "", "2027"], [12]),
        // HSA collapsed 2-bucket-per-type scheme.
        row(["", "", "HSA Annual - Elected 0", "", ""], [66]),
        row(["", "", "HSA Annual - Elected >0", "", ""], [47]),
        row(["", "", "HSA One Time - Elected 0", "", ""], [98]),
        row(["", "", "HSA One Time - Elected >0", "", ""], [15]),
        // Timeline — 2027-only since 2026-09-16 (the 2026 series and its
        // supporting mock bucket rows above were removed — see BUILD_PLAN
        // doc, "Reversal: 2026 day-by-day Timeline data is not usable").
        row(["", "", "", "2026-10-01", "2027"], [5]),
        row(["", "", "", "2026-10-02", "2027"], [9]),
        row(["", "", "", "2026-10-03", "2027"], [7]),
        row(["", "", "", "2026-10-04", "2027"], [3]),
        row(["", "", "", "2026-10-05", "2027"], [1]),
        row(["", "", "", "2026-10-06", "2027"], [11]),
        row(["", "", "", "2026-10-07", "2027"], [12]),
        row(["", "", "", "2026-10-08", "2027"], [10]),
        row(["", "", "", "2026-10-09", "2027"], [7]),
        row(["", "", "", "2026-10-10", "2027"], [5]),
        row(["", "", "", "2026-10-11", "2027"], [2]),
        row(["", "", "", "2026-10-12", "2027"], [1]),
        row(["", "", "", "2026-10-13", "2027"], [12]),
        row(["", "", "", "2026-10-14", "2027"], [16]),
        // New operational-only row-kinds, added 2026-09-13.
        row(["", "", "Multiple Attempts", "", ""], [9]),
        row(["", "", "Stalled 0-3 Days", "", ""], [12]),
        row(["", "", "Stalled 4-7 Days", "", ""], [7]),
        row(["", "", "Stalled 8+ Days", "", ""], [5]),
        row(["", "", "Recently Completed", "", ""], [4]),
        // Status x Eligible Employee Band — new 2026-09-14. The only
        // row-kind where BOTH dimensions_0 (Status) and dimensions_2
        // (Election_Category, here a band) are populated together.
        row(["Success", "", "20+", "", ""], [5]),
        row(["Not Started", "", "20+", "", ""], [3]),
        row(["In Progress", "", "20+", "", ""], [1]),
        row(["Success", "", "10-19", "", ""], [11]),
        row(["Not Started", "", "10-19", "", ""], [4]),
        row(["Abandoned", "", "10-19", "", ""], [2]),
        row(["Success", "", "3-9", "", ""], [28]),
        row(["Not Started", "", "3-9", "", ""], [6]),
        row(["In Progress", "", "3-9", "", ""], [3]),
        row(["Needs Follow-up", "", "3-9", "", ""], [2]),
        row(["Success", "", "Under 3", "", ""], [15]),
        row(["Not Started", "", "Under 3", "", ""], [9]),
        row(["Abandoned", "", "Under 3", "", ""], [2]),
        row(["Success", "", "Unknown", "", ""], [2]),
        row(["Not Started", "", "Unknown", "", ""], [1]),
        // "Eligible Count" — not rendered by this widget (no YoY panel),
        // included here only to confirm the shared parser safely ignores
        // it rather than misrouting it somewhere wrong.
        row(["", "", "Eligible Count", "", "2027"], [null, 1310]),
    ] };

    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host {
                display: block;
                box-sizing: border-box;
                font-family: "72", "Segoe UI", Arial, sans-serif;

                /* Same glassmorphism/depth design system as the original
                   widget, copied wholesale for visual consistency across
                   the split dashboards. */
                --mesh-1: rgba(106, 92, 240, 0.16);
                --mesh-2: rgba(47, 111, 224, 0.12);
                --mesh-3: rgba(20, 151, 111, 0.10);
                --surface: rgba(255, 255, 255, 0.58);
                --surface-solid: #ffffff;
                --surface-2: rgba(23, 26, 35, 0.055);
                --border: rgba(255, 255, 255, 0.65);
                --text: #171a23;
                --text-soft: #5b6072;
                --accent: #6a5cf0;
                --accent-bg: rgba(106, 92, 240, 0.14);
                --success: #14976f;
                --success-bg: rgba(20, 151, 111, 0.14);
                --warning: #a5700c;
                --warning-bg: rgba(165, 112, 12, 0.14);
                --info: #2f6fe0;
                --info-bg: rgba(47, 111, 224, 0.14);
                --danger: #c94b4b;
                --danger-bg: rgba(201, 75, 75, 0.14);
                --glass-blur: blur(20px) saturate(180%);
                --shadow-card: 0 1px 1px rgba(23,26,35,0.03), 0 4px 12px -2px rgba(23,26,35,0.07), 0 14px 28px -10px rgba(23,26,35,0.10);
            }
            * { box-sizing: border-box; }

            .dashboard {
                width: 100%;
                height: 100%;
                overflow: auto;
                background:
                    radial-gradient(at 12% 8%, var(--mesh-1) 0%, transparent 45%),
                    radial-gradient(at 88% 14%, var(--mesh-2) 0%, transparent 45%),
                    radial-gradient(at 50% 100%, var(--mesh-3) 0%, transparent 50%),
                    #f4f5fa;
                color: var(--text);
                border-radius: 18px;
                padding: 18px;
            }

            .tile, .panel, .badge {
                backdrop-filter: var(--glass-blur);
                -webkit-backdrop-filter: var(--glass-blur);
            }
            @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
                .tile, .panel { background: rgba(255,255,255,0.94) !important; }
            }

            .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
            .eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 4px; }
            .topbar h1 { font-size: 19px; font-weight: 700; margin: 0; display: inline; }
            .titlewrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
            .badge { font-size: 10.5px; font-weight: 600; letter-spacing: 0.01em; padding: 3px 9px; border-radius: 100px; border: 1px solid; white-space: nowrap; }
            .badge.accent { color: var(--accent); border-color: rgba(106,92,240,0.35); background: var(--accent-bg); }
            .asof { font-size: 11px; color: var(--text-soft); margin-top: 2px; }

            .section-title { font-size: 11.5px; font-weight: 700; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.05em; margin: 22px 0 8px; }
            .panel-caption { font-size: 12px; color: var(--text-soft); margin: -6px 0 8px; }

            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
            .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--shadow-card); }
            .tile .label { font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-soft); }
            .tile .value { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text); }
            .tile .sub { font-size: 11px; color: var(--text-soft); margin-top: -4px; }
            .tile .bar-track { height: 5px; border-radius: 4px; background: var(--surface-2); box-shadow: inset 0 1px 2px rgba(23,26,35,0.10); overflow: hidden; margin-top: 2px; }
            .tile .bar-fill { height: 100%; border-radius: 4px; }
            .tile.accent .value { color: var(--accent); } .tile.accent .bar-fill { background: var(--accent); }
            .tile.success .value { color: var(--success); } .tile.success .bar-fill { background: var(--success); }
            .tile.warning .value { color: var(--warning); } .tile.warning .bar-fill { background: var(--warning); }
            .tile.info .value { color: var(--info); } .tile.info .bar-fill { background: var(--info); }
            .tile.danger .value { color: var(--danger); } .tile.danger .bar-fill { background: var(--danger); }

            .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
            .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; box-shadow: var(--shadow-card); }
            .breakdown-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; padding: 6px 0; }
            .breakdown-row .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px rgba(106,92,240,0.16); }
            .breakdown-row .name { flex: none; width: 40%; color: var(--text); }
            .breakdown-row .track { flex: 1 1 auto; height: 6px; border-radius: 4px; background: var(--surface-2); box-shadow: inset 0 1px 2px rgba(23,26,35,0.10); overflow: hidden; }
            .breakdown-row .fill { height: 100%; border-radius: 4px; background: var(--accent); }
            .breakdown-row .val { flex: none; width: 3.5em; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text); }
            .empty-row { font-size: 12.5px; color: var(--text-soft); padding: 4px 0; }

            .stat-row { padding: 7px 0; }
            .stat-row-top { display: flex; align-items: center; gap: 8px; }
            .stat-row-top .name { flex: 1 1 auto; font-size: 12.5px; color: var(--text); }
            .stat-row-top .value { flex: none; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; }
            .stat-row-sub { font-size: 10.5px; color: var(--text-soft); margin: 1px 0 0 15px; font-variant-numeric: tabular-nums; }
            .progress-track { margin: 4px 0 0 15px; height: 5px; border-radius: 4px; background: var(--surface-2); box-shadow: inset 0 1px 2px rgba(23,26,35,0.10); overflow: hidden; }
            .progress-fill { height: 100%; border-radius: 4px; background: var(--accent); }
            .callout { font-size: 12px; color: var(--text-soft); margin: -4px 0 10px; }

            /* ---- Cross-tab grid — new 2026-09-13, Non-Completed by Status
               per Synod. A flat breakdown list would mean up to ~9 synods x
               4 statuses = 36 rows; a compact table reads far better. */
            .crosstab-wrap { overflow-x: auto; }
            .crosstab { width: 100%; border-collapse: collapse; font-size: 11.5px; white-space: nowrap; }
            .crosstab th, .crosstab td { padding: 5px 10px; text-align: right; border-bottom: 1px solid var(--border); }
            .crosstab th:first-child, .crosstab td:first-child { text-align: left; }
            .crosstab thead th { color: var(--text-soft); font-weight: 600; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.03em; }
            .crosstab tbody td { font-variant-numeric: tabular-nums; color: var(--text); }
            .crosstab tbody tr:last-child td { border-bottom: none; }

            /* ---- Timeline — day-by-day table + cumulative tracker.
               Reworked 2026-09-16, per Blair: ACTDATE can't support genuine
               day-by-day association for 2026 data (unreliable/sparse), so
               the 2026 series was removed entirely — 2027-only now. The
               On Track/Watch/Act status is also gone; it compared against
               the same unreliable 2026 numerator. The fixed, zero-filled
               10/1-10/14 window design stays. ---- */
            .cum-tracker { background: var(--surface-2); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
            .cum-tracker-title { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 10px; }
            .cum-tracker-row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
            .cum-stat { display: flex; flex-direction: column; gap: 2px; }
            .cum-stat-label { font-size: 10px; color: var(--text-soft); white-space: nowrap; }
            .cum-stat-value { font-size: 20px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }

            .timeline-table-wrap { overflow-x: auto; }
            .timeline-table { width: 100%; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
            .timeline-table th, .timeline-table td { padding: 6px 10px; text-align: right; border-bottom: 1px solid var(--border); }
            .timeline-table th:first-child, .timeline-table td:first-child { text-align: left; }
            .timeline-table thead th { color: var(--text-soft); font-weight: 600; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.03em; }
            .timeline-table tbody td { font-variant-numeric: tabular-nums; color: var(--text); }
            .timeline-table tbody tr:last-child td { border-bottom: none; }
        </style>
        <div class="dashboard">
            <div class="topbar">
                <div>
                    <div class="eyebrow">2026 Annual Enrollment</div>
                    <div class="titlewrap">
                        <h1>Operations</h1>
                        <span class="badge accent" id="dataBadge">Mock Data — Preview</span>
                    </div>
                    <div class="asof" id="asof"></div>
                </div>
            </div>

            <div class="section-title">Employer Selection</div>
            <div class="grid" id="employerTiles"></div>

            <div class="section-title">Not Yet Completed — By Employer Size</div>
            <div class="panel-caption" style="margin-top:-4px;">% of employers completed, by eligible employee band (largest first)</div>
            <div class="callout" id="bandCallout" hidden></div>
            <div class="panel">
                <div id="bandBreakdown"></div>
            </div>

            <div class="section-title">Working Queue</div>
            <div class="panels">
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Non-Completed — By Status</div>
                    <div class="panel-caption" style="margin-top:-4px;">Employers not yet completed, by current status</div>
                    <div id="statusBreakdown"></div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Stalled Time</div>
                    <div class="panel-caption" style="margin-top:-4px;">Non-completed employers, by days since last attempt</div>
                    <div id="stalledBreakdown"></div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Attempt &amp; Completion Activity</div>
                    <div class="panel-caption" style="margin-top:-4px;">Employers needing more than one attempt, and recent completions</div>
                    <div id="activityStats"></div>
                </div>
            </div>

            <div class="section-title">Non-Completed — By Status &amp; Synod</div>
            <div class="panel-caption" style="margin-top:-4px;">Working queue broken out by region</div>
            <div class="panel">
                <div class="crosstab-wrap" id="synodStatusCrosstab"></div>
            </div>

            <div class="section-title">Breakdowns</div>
            <div class="panels">
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Of Complete — Election Type</div>
                    <div class="panel-caption" style="margin-top:-4px;">Completed employers' selected health plan</div>
                    <div id="electionBreakdown"></div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">HSA Elections</div>
                    <div class="panel-caption" style="margin-top:-4px;">Completed employers' HSA/HRA elections</div>
                    <div id="hsaBreakdown"></div>
                </div>
            </div>

            <div class="section-title" id="timelineTitle">Timeline</div>
            <div class="panel-caption" id="timelineCaption">Day-by-day completions and cumulative pace vs. 2026</div>
            <div class="panel">
                <div id="timelineChart"></div>
            </div>
        </div>
    `;

    class AEOperations extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.appendChild(template.content.cloneNode(true));

            this._props = { width: 900, height: 700, asOfLabel: "" };
            this._employerStatus = MOCK_EMPLOYER_STATUS;
            this._usingMockData = true;
        }

        connectedCallback() {
            this._render();
        }

        onCustomWidgetBeforeUpdate(changedProperties) {
            this._props = Object.assign({}, this._props, changedProperties);
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            if ("width" in changedProperties) this.style.width = changedProperties.width + "px";
            if ("height" in changedProperties) this.style.height = changedProperties.height + "px";
            if ("employerStatus" in changedProperties) { this._employerStatus = changedProperties.employerStatus; this._usingMockData = false; }
            this._render();
        }

        onCustomWidgetDestroy() {
            // No timers/subscriptions held; nothing to tear down.
        }

        refresh() {
            this._render();
        }

        // ---- Parsing helpers — identical to the original widget's ----
        _dim(r, i) {
            const d = r["dimensions_" + i];
            if (!d) return "";
            if (d.id === "@NullMember" || d.label === "(Null)" || d.label === "(No Value)") return "";
            return d.label;
        }
        _measure(r, i) {
            const m = r["measures_" + i];
            return m ? Number(m.raw) : 0;
        }

        _formatPct(pct) {
            if (pct > 0 && pct < 1) return pct.toFixed(1) + "%";
            return Math.round(pct) + "%";
        }

        _statusBucket(status) {
            if (COMPLETED_STATUSES.includes(status)) return "Completed";
            if (DEFAULTED_STATUSES.includes(status)) return "Defaulted";
            if (OPEN_STATUSES.includes(status)) return "Open";
            return null;
        }

        _normalizeDateKey(raw) {
            const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
            if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
            const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
            const human = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(raw);
            if (human && MONTHS[human[1]]) {
                return `${human[3]}-${MONTHS[human[1]]}-${human[2].padStart(2, "0")}`;
            }
            return raw;
        }

        // Fixed AE election window — confirmed by Blair, 2026-09-15/16:
        // Annual Enrollment always runs 10/1 through 10/14, every plan
        // year. Ported verbatim from sac-ae-snap-report-widget — see
        // BUILD_PLAN_VWEMPLOYERSAVES.md, "Timeline fixed to the real
        // 10/1-10/14 AE window", for the full rationale.
        static get AE_WINDOW_MONTH() { return "10"; }
        static get AE_WINDOW_START_DAY() { return 1; }
        static get AE_WINDOW_LENGTH_DAYS() { return 14; }

        _anchorYear(isoDates) {
            const counts = {};
            Object.keys(isoDates).forEach((iso) => {
                const y = iso.slice(0, 4);
                counts[y] = (counts[y] || 0) + 1;
            });
            let best = null, bestCount = -1;
            Object.keys(counts).forEach((y) => {
                if (counts[y] > bestCount) { best = y; bestCount = counts[y]; }
            });
            return best;
        }

        _fixedWindowCounts(isoDates) {
            const anchorYear = this._anchorYear(isoDates);
            const out = {};
            for (let i = 0; i < this.constructor.AE_WINDOW_LENGTH_DAYS; i++) {
                const dd = String(this.constructor.AE_WINDOW_START_DAY + i).padStart(2, "0");
                const mmdd = `${this.constructor.AE_WINDOW_MONTH}-${dd}`;
                const iso = anchorYear ? `${anchorYear}-${mmdd}` : null;
                out[mmdd] = (iso && isoDates[iso]) || 0;
            }
            return out;
        }

        _synodGroupKey(name) {
            const m = /^(\d+)/.exec(name);
            return m ? m[1] : name;
        }

        // Parses the shared employerStatus feed, including the 3 new
        // operational-only row-kinds this widget reads. Rows this widget
        // doesn't need (YoY's "Eligible Count", the 2026 side of health-plan
        // buckets) are safely ignored rather than misrouted — see the
        // explicit "if (subType) return" safety net near the end of the
        // per-row branches.
        _parseEmployerStatus() {
            const rows = (this._employerStatus && this._employerStatus.data) || [];
            const bySynod = {};
            const bySynodNames = {};
            const bySynodStatus = {}; // groupKey -> { status -> count } — new 2026-09-13 cross-tab
            const byStatus = {};
            const rawDates = {}; // simplified back to single-series 2026-09-16 (was rawDatesByYear) —
                                    // the 2026 side was removed entirely, see BUILD_PLAN_VWEMPLOYERSAVES.md,
                                    // "Reversal: 2026 day-by-day Timeline data is not usable". Keyed by
                                    // full "YYYY-MM-DD" so _fixedWindowCounts() can anchor to the real
                                    // calendar year and clip/zero-fill to the fixed 10/1-10/14 AE window.
            const byHealthPlan = {};
            const byHsaBucket = {};
            const byStalledBucket = {}; // new 2026-09-13
            const byBand = {}; // new 2026-09-14 — { total, completed } per Eligible Employee Band
            let totalSetUp = 0, completed = 0, defaulted = 0, open = 0;
            let multipleAttempts = 0, recentlyCompleted = 0; // new 2026-09-13

            rows.forEach((r) => {
                const status = this._dim(r, 0);
                const synod = this._dim(r, 1);
                const subType = this._dim(r, 2);
                const date = this._dim(r, 3);
                const year = this._dim(r, 4);
                const employerCount = this._measure(r, 0);

                if (date) {
                    // Defensive: skip any date row not tagged 2027 (or
                    // untagged) — in case a not-yet-redeployed cube still
                    // emits the retired 2026 Timeline block mid-rollout.
                    if (year && year !== "2027") return;
                    const iso = this._normalizeDateKey(date);
                    rawDates[iso] = (rawDates[iso] || 0) + employerCount;
                    return;
                }

                if (subType === "Eligible Count") return; // YoY-only, not rendered by this widget

                // Status x Eligible Employee Band — new 2026-09-14. The only
                // row-kind where Status AND Election_Category are both
                // populated at once; every other row-kind leaves one blank.
                if (status && subType && BAND_ORDER.includes(subType)) {
                    if (!byBand[subType]) byBand[subType] = { total: 0, completed: 0 };
                    byBand[subType].total += employerCount;
                    if (this._statusBucket(status) === "Completed") byBand[subType].completed += employerCount;
                    return;
                }

                if (subType && subType.indexOf("HSA ") === 0) {
                    byHsaBucket[subType] = (byHsaBucket[subType] || 0) + employerCount;
                    return;
                }

                if (subType && year) {
                    // Only the 2027 side is ever read downstream (byElectionType) —
                    // this widget has no YoY panel — but both years are harmlessly
                    // tracked here in case that changes later.
                    if (!byHealthPlan[year]) byHealthPlan[year] = {};
                    byHealthPlan[year][subType] = (byHealthPlan[year][subType] || 0) + employerCount;
                    return;
                }

                if (subType === "Multiple Attempts") {
                    multipleAttempts += employerCount;
                    return;
                }

                if (subType === "Recently Completed") {
                    recentlyCompleted += employerCount;
                    return;
                }

                if (subType && subType.indexOf("Stalled ") === 0) {
                    byStalledBucket[subType] = (byStalledBucket[subType] || 0) + employerCount;
                    return;
                }

                // Safety net: anything else with a non-empty subType that
                // didn't match a branch above (there shouldn't be any, but
                // without this a stray/unexpected row-kind would silently
                // fall through into the plain status/synod accounting below
                // and inflate totalSetUp incorrectly, since status/synod are
                // both blank on these rows).
                if (subType) return;

                const bucket = this._statusBucket(status);

                totalSetUp += employerCount;
                if (bucket === "Completed") completed += employerCount;
                else if (bucket === "Defaulted") defaulted += employerCount;
                else if (bucket === "Open") open += employerCount;

                if (bucket === "Open" && status) {
                    byStatus[status] = (byStatus[status] || 0) + employerCount;
                }

                if (synod) {
                    const groupKey = this._synodGroupKey(synod);
                    if (!bySynod[groupKey]) bySynod[groupKey] = { total: 0, completed: 0 };
                    bySynod[groupKey].total += employerCount;
                    if (bucket === "Completed") bySynod[groupKey].completed += employerCount;
                    if (!bySynodNames[groupKey]) bySynodNames[groupKey] = new Set();
                    bySynodNames[groupKey].add(synod);

                    if (bucket === "Open" && status) {
                        if (!bySynodStatus[groupKey]) bySynodStatus[groupKey] = {};
                        bySynodStatus[groupKey][status] = (bySynodStatus[groupKey][status] || 0) + employerCount;
                    }
                }
            });

            const pctComplete = totalSetUp ? (completed / totalSetUp) * 100 : 0;
            // Fixed, zero-filled 10/1-10/14 window — always exactly 14
            // entries, in order, regardless of which days actually had
            // completions or whether any stray out-of-window dates showed
            // up in the bound data. 2027-only since 2026-09-16.
            const fixed = this._fixedWindowCounts(rawDates);
            const daily = [];
            for (let i = 0; i < this.constructor.AE_WINDOW_LENGTH_DAYS; i++) {
                const dd = String(this.constructor.AE_WINDOW_START_DAY + i).padStart(2, "0");
                const mmdd = `${this.constructor.AE_WINDOW_MONTH}-${dd}`;
                daily.push({ mmdd, count: fixed[mmdd] || 0 });
            }
            return {
                totalSetUp, completed, defaulted, open, pctComplete,
                bySynod, bySynodNames, bySynodStatus, byStatus, daily,
                byElectionType: byHealthPlan["2027"] || {},
                byHsaBucket, byStalledBucket, byBand,
                multipleAttempts, recentlyCompleted,
            };
        }

        // ---- Small render helpers — identical to the original widget's ----
        _tileHtml(label, value, sub, pctOfMax, cls) {
            return `
                <div class="tile ${cls}">
                    <div class="label">${label}</div>
                    <div class="value">${value}</div>
                    <div class="sub">${sub}</div>
                    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, pctOfMax))}%"></div></div>
                </div>`;
        }

        _breakdownRowsHtml(entries, emptyMessage) {
            if (!entries.length) return `<div class="empty-row">${emptyMessage}</div>`;
            const max = Math.max(1, ...entries.map((e) => e.value));
            return entries.map((e) =>
                `<div class="breakdown-row">
                    <span class="dot"></span>
                    <span class="name"${e.title ? ` title="${e.title}"` : ""}>${e.name}</span>
                    <span class="track"><span class="fill" style="width:${Math.round((e.value / max) * 100)}%"></span></span>
                    <span class="val">${e.display !== undefined ? e.display : e.value}</span>
                </div>`
            ).join("");
        }

        _statRowsHtml(entries, emptyMessage) {
            if (!entries.length) return `<div class="empty-row">${emptyMessage}</div>`;
            return entries.map((e) =>
                `<div class="stat-row">
                    <div class="stat-row-top">
                        <span class="dot"></span>
                        <span class="name">${e.name}</span>
                        <span class="value">${e.value}</span>
                    </div>
                    ${e.sub !== undefined ? `<div class="stat-row-sub">${e.sub}</div>` : ""}
                </div>`
            ).join("");
        }

        // Copied verbatim from the Executive widget — same completion-
        // progress design (X of Y completed + % bar), reused here for the
        // Eligible Employee Band panel (new 2026-09-14) instead of Synod.
        _progressRowsHtml(entries, emptyMessage) {
            if (!entries.length) return `<div class="empty-row">${emptyMessage}</div>`;
            return entries.map((e) =>
                `<div class="stat-row">
                    <div class="stat-row-top">
                        <span class="dot"></span>
                        <span class="name"${e.title ? ` title="${e.title}"` : ""}>${e.name}</span>
                        <span class="value">${e.value}</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, e.pct))}%"></div></div>
                    ${e.sub !== undefined ? `<div class="stat-row-sub">${e.sub}</div>` : ""}
                </div>`
            ).join("");
        }

        // Renders the Non-Completed by Status x Synod cross-tab as a compact
        // HTML table — new 2026-09-13. synodRows: [{ name, title? }],
        // statusCols: [string], cell lookup via bySynodStatus.
        _crosstabHtml(synodRows, statusCols, bySynodStatus, emptyMessage) {
            if (!synodRows.length) return `<div class="empty-row">${emptyMessage}</div>`;
            const head = `<tr><th>Synod</th>${statusCols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
            const body = synodRows.map((s) => {
                const cells = statusCols.map((c) => `<td>${((bySynodStatus[s.key] || {})[c] || 0).toLocaleString()}</td>`).join("");
                return `<tr><td${s.title ? ` title="${s.title}"` : ""}>${s.name}</td>${cells}</tr>`;
            }).join("");
            return `<table class="crosstab"><thead>${head}</thead><tbody>${body}</tbody></table>`;
        }

        // ---- Rendering ----
        _render() {
            const root = this._shadowRoot;
            const status = this._parseEmployerStatus();
            const daily = status.daily;

            // "Live" language dropped 2026-09-14, per Blair — unhelpful on
            // this dashboard.
            // Changed 2026-09-16, also per Blair: "As of" was showing the
            // literal word "Live" (whatever the Story's asOfLabel property
            // happened to be set to) instead of an actual date/time. Now
            // computed by the widget itself from the viewer's own clock —
            // date AND time here (unlike Snap Report's date-only version),
            // since this is the working-team/operational dashboard, checked
            // throughout the day. Safe to use new Date() with no arguments
            // (just "what time is it right now") — different from, and not
            // subject to, the date-STRING-parsing timezone risk documented
            // elsewhere in this file for Timeline labels. The asOfLabel
            // property is no longer read.
            const asOfEl = root.getElementById("asof");
            asOfEl.textContent = "As of: " + new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
            asOfEl.hidden = false;
            const dataBadgeEl = root.getElementById("dataBadge");
            dataBadgeEl.textContent = "Mock Data — Preview";
            dataBadgeEl.hidden = !this._usingMockData;

            // Trimmed to 3 tiles, per the Executive/Operational split —
            // % Complete and a scorecard-style Defaulted tile read more like
            // leadership framing; the ops team's real orientation numbers
            // are just these three.
            const pctOpen = status.totalSetUp ? (status.open / status.totalSetUp) * 100 : 0;
            const tilesHtml = [
                this._tileHtml("Total Set Up", status.totalSetUp, "in current filter", 100, "accent"),
                this._tileHtml("Completed", status.completed, this._formatPct(status.pctComplete) + " of total", status.pctComplete, "success"),
                this._tileHtml("Non-Completed", status.open, this._formatPct(pctOpen) + " of total", pctOpen, "warning"),
            ].join("");
            root.getElementById("employerTiles").innerHTML = tilesHtml;

            // Not Yet Completed — By Employer Size — new 2026-09-14.
            // Largest-band-first, mirroring Executive's Synod progress
            // panel design. A callout above the panel surfaces the 20+
            // band's outstanding (non-completed) count specifically, since
            // that's the literal "still not started" framing Blair used —
            // shown only when that band exists and has outstanding employers.
            const bandEntries = BAND_ORDER
                .filter((b) => status.byBand[b])
                .map((b) => {
                    const { total, completed: bandCompleted } = status.byBand[b];
                    const pct = total ? (bandCompleted / total) * 100 : 0;
                    return { name: b, value: this._formatPct(pct), pct, sub: `${bandCompleted.toLocaleString()} of ${total.toLocaleString()} completed` };
                });
            root.getElementById("bandBreakdown").innerHTML = this._progressRowsHtml(bandEntries, "No Eligible Employee Band data bound yet");

            const topBand = status.byBand["20+"];
            const topBandOutstanding = topBand ? topBand.total - topBand.completed : 0;
            const bandCalloutEl = root.getElementById("bandCallout");
            if (topBand && topBandOutstanding > 0) {
                bandCalloutEl.textContent = `Needs attention: ${topBandOutstanding.toLocaleString()} employer${topBandOutstanding === 1 ? "" : "s"} with 20+ eligible employees not yet completed`;
                bandCalloutEl.hidden = false;
            } else {
                bandCalloutEl.hidden = true;
            }

            // Non-Completed by status.
            const statusEntries = Object.keys(status.byStatus).map((s) => {
                const pct = status.open ? (status.byStatus[s] / status.open) * 100 : 0;
                return { name: s, value: Number(status.byStatus[s]).toLocaleString(), sub: `${this._formatPct(pct)} of non-completed` };
            });
            root.getElementById("statusBreakdown").innerHTML = this._statRowsHtml(statusEntries, "No status data bound yet");

            // Stalled-time buckets — new 2026-09-13.
            const stalledEntries = STALLED_BUCKET_ORDER
                .filter((k) => status.byStalledBucket[k] !== undefined)
                .map((k) => ({ name: k.replace("Stalled ", ""), value: status.byStalledBucket[k] }));
            root.getElementById("stalledBreakdown").innerHTML = this._breakdownRowsHtml(stalledEntries, "No stalled-time data bound yet");

            // Multiple Attempts / Recently Completed — new 2026-09-13, two
            // simple stat callouts side by side.
            const activityEntries = [
                { name: "Needed >1 Attempt", value: status.multipleAttempts.toLocaleString() },
                { name: "Completed in Last 2 Days", value: status.recentlyCompleted.toLocaleString() },
            ];
            root.getElementById("activityStats").innerHTML = this._statRowsHtml(activityEntries, "No activity data bound yet");

            // Non-Completed by Status & Synod cross-tab — new 2026-09-13.
            const OPEN_STATUS_COLUMNS = ["Not Started", "In Progress", "Abandoned", "Needs Follow-up"];
            const synodRows = Object.keys(status.bySynod).map((s) => ({
                key: s,
                name: /^\d+$/.test(s) ? `Synod ${s}` : s,
                title: status.bySynodNames[s] ? Array.from(status.bySynodNames[s]).sort().join(", ") : undefined,
            }));
            root.getElementById("synodStatusCrosstab").innerHTML = this._crosstabHtml(synodRows, OPEN_STATUS_COLUMNS, status.bySynodStatus, "No Synod/Status data bound yet");

            // Of-complete election sub-type breakdown (current year — 2027).
            const electionEntries = Object.keys(status.byElectionType).map((t) => ({ name: t, value: status.byElectionType[t] }));
            root.getElementById("electionBreakdown").innerHTML = this._breakdownRowsHtml(electionEntries, "No election sub-type data bound yet");

            // HSA breakdown.
            const HSA_LABELS = {
                "HSA Annual - Elected 0": "Annual — None Elected",
                "HSA Annual - Elected >0": "Annual — Elected",
                "HSA One Time - Elected 0": "One Time — None Elected",
                "HSA One Time - Elected >0": "One Time — Elected",
            };
            const hsaEntries = Object.keys(HSA_LABELS)
                .filter((k) => status.byHsaBucket[k] !== undefined)
                .map((k) => ({ name: HSA_LABELS[k], value: status.byHsaBucket[k] }));
            root.getElementById("hsaBreakdown").innerHTML = this._breakdownRowsHtml(hsaEntries, "No HSA data bound yet");

            // Timeline — day-by-day table + cumulative tracker, 2027-only
            // since 2026-09-16 (ACTDATE can't support day-by-day for 2026 —
            // see BUILD_PLAN doc).
            const total2027 = status.totalSetUp;
            this._renderTimeline(root.getElementById("timelineChart"), daily, total2027);

            const titleEl = root.getElementById("timelineTitle");
            if (daily.length) {
                const fmt = (mmdd) => { const [m, d] = mmdd.split("-"); return `${Number(m)}/${Number(d)}`; };
                titleEl.textContent = `Timeline (${fmt(daily[0].mmdd)} – ${fmt(daily[daily.length - 1].mmdd)})`;
            } else {
                titleEl.textContent = "Timeline";
            }
        }

        // Day-by-day table + leading cumulative tracker — reworked
        // 2026-09-16 to drop the 2026 series entirely (see BUILD_PLAN doc,
        // "Reversal: 2026 day-by-day Timeline data is not usable"). Kept:
        // the fixed 10/1-10/14 window design, and Count/% Completed 2027.
        _renderTimeline(container, daily, total2027) {
            if (!daily.length) {
                container.innerHTML = `<div class="empty-row">No timeline data bound yet</div>`;
                return;
            }

            let cum2027 = 0;
            const rows = daily.map((d, i) => {
                cum2027 += d.count;
                return {
                    dayLabel: `AE Day ${i + 1}`,
                    mmdd: d.mmdd,
                    count2027: d.count,
                    pct2027: total2027 ? (d.count / total2027) * 100 : 0,
                };
            });

            const cumPct2027 = total2027 ? (cum2027 / total2027) * 100 : 0;

            const tracker = `
                <div class="cum-tracker">
                    <div class="cum-tracker-title">Cumulative Tally Tracker</div>
                    <div class="cum-tracker-row">
                        <div class="cum-stat">
                            <div class="cum-stat-label">Count Completed 2027</div>
                            <div class="cum-stat-value">${cum2027.toLocaleString()}</div>
                        </div>
                        <div class="cum-stat">
                            <div class="cum-stat-label">% Completed 2027</div>
                            <div class="cum-stat-value">${this._formatPct(cumPct2027)}</div>
                        </div>
                    </div>
                </div>`;

            const tableRows = rows.map((r) => `
                <tr title="${r.mmdd}">
                    <td>${r.dayLabel}</td>
                    <td>${r.count2027.toLocaleString()}</td>
                    <td>${this._formatPct(r.pct2027)}</td>
                </tr>`).join("");

            const table = `
                <div class="timeline-table-wrap">
                    <table class="timeline-table">
                        <thead>
                            <tr><th>Day</th><th>Count Completed 2027</th><th>% Completed 2027</th></tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>`;

            container.innerHTML = tracker + table;
        }
    }

    customElements.define("com-porticobenefits-aeoperations", AEOperations);
})();
