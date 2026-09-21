(function () {
  "use strict";
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ---------------- Shared: HTML/date helpers, current-user identity, generic history modal ----------------
  var ZB = {};
  (function () {
    function escapeHtml(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
    function fmtDateTime(iso) {
      try {
        return new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      } catch (e) { return iso; }
    }
    ZB.escapeHtml = escapeHtml;
    ZB.fmtDateTime = fmtDateTime;

    // ---- Report date: always "yesterday" relative to whenever the page is opened ----
    var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var rd = new Date();
    rd.setDate(rd.getDate() - 1);
    function pad2(n) { return n < 10 ? "0" + n : String(n); }
    ZB.reportDate = rd.getFullYear() + "-" + pad2(rd.getMonth() + 1) + "-" + pad2(rd.getDate());
    ZB.reportDateLabel = WEEKDAYS[rd.getDay()] + ", " + rd.getDate() + " " + MONTHS[rd.getMonth()] + " " + rd.getFullYear();
    ZB.reportDateShort = rd.getDate() + " " + MONTHS[rd.getMonth()] + " " + rd.getFullYear();
    var today = new Date();
    ZB.todayDateShort = today.getDate() + " " + MONTHS[today.getMonth()] + " " + today.getFullYear();
    document.querySelectorAll(".zb-report-date").forEach(function (el) { el.textContent = ZB.reportDateLabel; });
    document.querySelectorAll(".zb-report-date-short").forEach(function (el) { el.textContent = ZB.reportDateShort; });
    document.querySelectorAll(".zb-today-date").forEach(function (el) { el.textContent = ZB.todayDateShort; });

    var userChip = document.getElementById("currentUserChip");
    var userLabel = document.getElementById("currentUserLabel");
    var empCodeParam = new URLSearchParams(window.location.search).get("currentUser");
    ZB.currentUserPromise = empCodeParam
      ? fetch("/api/employee/lookup?code=" + encodeURIComponent(empCodeParam))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.employee) {
              userChip.hidden = false;
              userChip.classList.remove("warn");
              userLabel.textContent = data.employee.name + (data.employee.position ? " · " + data.employee.position : "");
              return data.employee;
            }
            userChip.hidden = false;
            userChip.classList.add("warn");
            userLabel.textContent = "ไม่พบรหัสพนักงาน " + empCodeParam + " (แก้ไขไม่ได้)";
            return null;
          })
          .catch(function () {
            userChip.hidden = false;
            userChip.classList.add("warn");
            userLabel.textContent = "ตรวจสอบผู้ใช้งานไม่สำเร็จ (แก้ไขไม่ได้)";
            return null;
          })
      : (function () {
          userChip.hidden = false;
          userChip.classList.add("warn");
          userLabel.textContent = "เปิดผ่านลิงก์ที่มี ?currentUser=รหัสพนักงาน เพื่อแก้ไขข้อมูล";
          return Promise.resolve(null);
        })();

    var historyOverlay = document.getElementById("hlHistoryOverlay");
    var historyTitle = document.getElementById("hlHistoryTitle");
    var historySubtitle = document.getElementById("hlHistorySubtitle");
    var historyList = document.getElementById("hlHistoryList");
    var historyCloseBtn = document.getElementById("hlHistoryCloseBtn");

    function openHistory(titleText, subtitleText, url, renderRow) {
      historyTitle.textContent = titleText;
      historySubtitle.textContent = subtitleText;
      historyList.innerHTML = '<div class="dtable-empty">กำลังโหลด…</div>';
      historyOverlay.hidden = false;
      document.body.style.overflow = "hidden";
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var rows = data.rows || [];
          if (!rows.length) {
            historyList.innerHTML = '<div class="dtable-empty">ยังไม่มีประวัติการแก้ไข</div>';
            return;
          }
          historyList.innerHTML = rows.map(renderRow).join("");
        })
        .catch(function () {
          historyList.innerHTML = '<div class="dtable-empty">โหลดประวัติไม่สำเร็จ</div>';
        });
    }
    function closeHistory() {
      historyOverlay.hidden = true;
      document.body.style.overflow = "";
    }
    historyCloseBtn.addEventListener("click", closeHistory);
    historyOverlay.addEventListener("click", function (ev) { if (ev.target === historyOverlay) closeHistory(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !historyOverlay.hidden) closeHistory();
    });
    ZB.openHistory = openHistory;
  })();

  // ---------------- Downtime: chart by category + detail list, filterable by plant ----------------
  (function () {
    // Real downtime events from dbo.Downtimes (SQL_DOWNTIME_HOST, synced from the plant-side
    // center via scripts/sync-downtime.js), aggregated per plant/category/cause for ZB.reportDate.
    // Loaded via /api/production/downtime-detail - see loadDowntimeData() near the bottom of this module.
    var DOWNTIME_DATA = [];
    var CATEGORIES = [
      { key: "mechanical", label: "Mechanical" },
      { key: "electrical", label: "Electrical" },
      { key: "process", label: "Process" },
      { key: "changeover", label: "Changeover" },
      { key: "planned", label: "Planned" },
      { key: "quality", label: "Quality" },
      { key: "others", label: "Others" }
    ];

    window.__zbPrintData = window.__zbPrintData || {};

    var chartSvg = document.getElementById("dtCatSvg");
    var chartTip = document.getElementById("dtCatTip");
    var detailBody = document.getElementById("downtimeDetailBody");
    var detailPagination = document.getElementById("downtimeDetailPagination");
    var summaryInline = document.getElementById("downtimeSummaryInline");
    var plantTabs = Array.prototype.slice.call(document.querySelectorAll("#downtimePlantTabs .filter-tab"));
    var catFilterChip = document.getElementById("dtCatFilterChip");
    var catFilterDot = document.getElementById("dtCatFilterDot");
    var catFilterLabel = document.getElementById("dtCatFilterLabel");
    var catFilterClear = document.getElementById("dtCatFilterClear");
    if (!chartSvg || !detailBody) return;

    var DETAIL_PAGE_SIZE = 6;
    var currentRows = [];
    var sortedDetailRows = [];
    var detailPlantFilter = "all";
    var detailPage = 1;
    var categoryFilter = null;

    function setCategoryFilter(key) {
      categoryFilter = (categoryFilter === key) ? null : key;
      if (categoryFilter) {
        var cat = CATEGORIES.filter(function (c) { return c.key === categoryFilter; })[0];
        catFilterChip.hidden = false;
        catFilterDot.style.background = "var(--cat-" + categoryFilter + ")";
        catFilterLabel.textContent = cat ? cat.label : categoryFilter;
      } else {
        catFilterChip.hidden = true;
      }
      drawCategoryChart(currentRows);
      renderDetailTable(currentRows, detailPlantFilter);
    }
    if (catFilterClear) catFilterClear.addEventListener("click", function () { setCategoryFilter(null); });

    function drawCategoryChart(rows) {
      while (chartSvg.firstChild) chartSvg.removeChild(chartSvg.firstChild);
      var W = 420, H = 250, padL = 16, padR = 16, padT = 14, padB = 60;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var border = cssVar("--border-soft"), inkSec = cssVar("--ink-secondary"), ink = cssVar("--ink");

      var totals = CATEGORIES.map(function (cat) {
        var catRows = rows.filter(function (r) { return r.category === cat.key; });
        return {
          key: cat.key, label: cat.label,
          min: catRows.reduce(function (s, r) { return s + r.duration; }, 0),
          occ: catRows.reduce(function (s, r) { return s + r.occ; }, 0)
        };
      });
      var maxVal = Math.max(20, Math.max.apply(null, totals.map(function (t) { return t.min; })) * 1.2);
      var barW = Math.min(52, plotW / totals.length - 14);
      var groupW = plotW / totals.length;

      chartSvg.appendChild(el("line", { x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH, stroke: border, "stroke-width": 1 }));

      totals.forEach(function (t, i) {
        var cx = padL + groupW * i + groupW / 2;
        var h = (t.min / maxVal) * plotH;
        var y = padT + plotH - h;
        var color = cssVar("--cat-" + t.key);

        var isSelected = categoryFilter === t.key;
        var dimmed = categoryFilter && !isSelected;
        var rect = el("rect", {
          x: cx - barW / 2, y: y, width: barW, height: Math.max(h, t.min > 0 ? 2 : 0), rx: 5,
          fill: t.min > 0 ? color : border,
          opacity: dimmed ? 0.35 : 1,
          stroke: isSelected ? ink : "none",
          "stroke-width": isSelected ? 2 : 0
        });
        rect.style.cursor = t.min > 0 ? "pointer" : "default";
        if (t.min > 0) {
          rect.addEventListener("mouseenter", function () {
            var box = chartSvg.getBoundingClientRect(); var scale = box.width / W;
            chartTip.style.left = (cx * scale) + "px";
            chartTip.style.top = (y * scale) + "px";
            chartTip.innerHTML = '<div class="t-title">' + t.label + '</div>' +
              '<div class="t-row"><span class="t-dot" style="background:' + color + '"></span>' + t.min + ' min total</div>' +
              '<div>' + t.occ + ' occurrence' + (t.occ !== 1 ? "s" : "") + '</div>' +
              '<div style="opacity:.7; margin-top:3px;">Click to ' + (isSelected ? "clear filter" : "filter") + '</div>';
            chartTip.classList.add("visible");
          });
          rect.addEventListener("mouseleave", function () { chartTip.classList.remove("visible"); });
          rect.addEventListener("click", function () { setCategoryFilter(t.key); });
        }
        chartSvg.appendChild(rect);

        if (t.min > 0) {
          var vlabel = el("text", { x: cx, y: y - 7, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: ink, "font-variant-numeric": "tabular-nums" });
          vlabel.textContent = t.min + " min";
          chartSvg.appendChild(vlabel);
        }

        var lbl = el("text", { x: cx, y: H - padB + 18, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: inkSec });
        lbl.textContent = t.label;
        chartSvg.appendChild(lbl);
      });
    }

    function detailRowHtml(r) {
      return '<tr>' +
        '<td><span class="cat-cell"><span class="cat-dot" style="background:var(--cat-' + r.category + ');"></span>' + CATEGORIES.filter(function (c) { return c.key === r.category; })[0].label + '</span></td>' +
        '<td class="cause-cell">' + (detailPlantFilter === "all" ? '<span class="plant-tag">' + r.plantLabel + '</span> ' : '') + r.cause + '</td>' +
        '<td class="num">' + r.duration + ' min</td>' +
        '<td class="num">' + r.occ + '</td>' +
        '</tr>';
    }

    function renderDetailPage() {
      if (!sortedDetailRows.length) {
        detailBody.innerHTML = '<tr><td colspan="4" class="dtable-empty">No downtime recorded for this plant.</td></tr>';
        detailPagination.innerHTML = "";
        return;
      }
      var totalPages = Math.max(1, Math.ceil(sortedDetailRows.length / DETAIL_PAGE_SIZE));
      detailPage = Math.min(Math.max(1, detailPage), totalPages);
      var start = (detailPage - 1) * DETAIL_PAGE_SIZE;
      var pageRows = sortedDetailRows.slice(start, start + DETAIL_PAGE_SIZE);
      detailBody.innerHTML = pageRows.map(detailRowHtml).join("");

      var infoText = 'Showing ' + (start + 1) + '–' + Math.min(start + DETAIL_PAGE_SIZE, sortedDetailRows.length) + ' of ' + sortedDetailRows.length;
      var controls = '<button class="page-btn" type="button" data-nav="prev"' + (detailPage === 1 ? ' disabled' : '') + ' aria-label="Previous page">&lsaquo;</button>';
      for (var p = 1; p <= totalPages; p++) {
        controls += '<button class="page-btn' + (p === detailPage ? ' active' : '') + '" type="button" data-page="' + p + '">' + p + '</button>';
      }
      controls += '<button class="page-btn" type="button" data-nav="next"' + (detailPage === totalPages ? ' disabled' : '') + ' aria-label="Next page">&rsaquo;</button>';
      detailPagination.innerHTML = '<span class="pagination-info">' + infoText + '</span><span class="pagination-controls">' + controls + '</span>';

      detailPagination.querySelectorAll("[data-page]").forEach(function (btn) {
        btn.addEventListener("click", function () { detailPage = parseInt(btn.dataset.page, 10); renderDetailPage(); });
      });
      detailPagination.querySelectorAll("[data-nav]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (btn.dataset.nav === "prev" && detailPage > 1) detailPage--;
          if (btn.dataset.nav === "next" && detailPage < totalPages) detailPage++;
          renderDetailPage();
        });
      });
    }

    function renderDetailTable(rows, plantFilter) {
      detailPlantFilter = plantFilter;
      var filtered = categoryFilter ? rows.filter(function (r) { return r.category === categoryFilter; }) : rows;
      sortedDetailRows = filtered.slice().sort(function (a, b) { return b.duration - a.duration; });
      detailPage = 1;
      renderDetailPage();
    }

    function renderDowntime(plantFilter, keepCategoryFilter) {
      currentRows = plantFilter === "all" ? DOWNTIME_DATA : DOWNTIME_DATA.filter(function (r) { return r.plant === plantFilter; });
      if (!keepCategoryFilter && categoryFilter) {
        categoryFilter = null;
        if (catFilterChip) catFilterChip.hidden = true;
      }

      var totalMin = 0, totalOcc = 0;
      currentRows.forEach(function (r) { totalMin += r.duration; totalOcc += r.occ; });
      if (summaryInline) {
        summaryInline.innerHTML = '<b>' + totalMin + ' min</b> total &middot; <b>' + totalOcc + '</b> occurrences' +
          (plantFilter === "all" ? ' across 3 plants' : '');
      }

      drawCategoryChart(currentRows);
      renderDetailTable(currentRows, plantFilter);
    }

    plantTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        plantTabs.forEach(function (t) { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        renderDowntime(tab.dataset.plant);
      });
    });

    // Print/export always shows the full "All Plants" breakdown, every row, regardless of the on-screen filter/page.
    window.__zbShowAllDowntimeForPrint = function () {
      plantTabs.forEach(function (t) { t.classList.toggle("active", t.dataset.plant === "all"); t.setAttribute("aria-selected", t.dataset.plant === "all" ? "true" : "false"); });
      renderDowntime("all");
      detailBody.innerHTML = sortedDetailRows.map(detailRowHtml).join("");
    };
    window.__zbRestoreDowntimeDetailAfterPrint = function () {
      renderDetailPage();
    };

    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { drawCategoryChart(currentRows); });
    }
    window.addEventListener("resize", function () {
      clearTimeout(window.__zbDtT);
      window.__zbDtT = setTimeout(function () { drawCategoryChart(currentRows); }, 120);
    });

    function loadDowntimeData() {
      if (summaryInline) summaryInline.innerHTML = "กำลังโหลด…";
      fetch("/api/production/downtime-detail?date=" + ZB.reportDate)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          DOWNTIME_DATA = data.rows || [];
          window.__zbPrintData.downtimeData = DOWNTIME_DATA;
          var activePlant = plantTabs.filter(function (t) { return t.classList.contains("active"); })[0];
          renderDowntime(activePlant ? activePlant.dataset.plant : "all");
        })
        .catch(function () {
          if (summaryInline) summaryInline.textContent = "โหลดข้อมูลไม่สำเร็จ";
        });
    }
    window.__zbLoadDowntimeData = loadDowntimeData;
    loadDowntimeData();
  })();

  // ---------------- Production Daily: Target/Actual/Yield per plant, live for ZB.reportDate ----------------
  (function () {
    var panels = Array.prototype.slice.call(document.querySelectorAll(".plant-panel[data-plant-key]"));
    if (!panels.length) return;

    var DONUT_CIRC = 263.894; // 2 * pi * r(42)

    function fmtTon(n) {
      return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }
    function statusLabel(pct) {
      if (pct == null) return "No Data";
      if (pct >= 100) return "On Plan";
      if (pct >= 95) return "Below Target";
      return "Significantly Below";
    }
    function arrowPath(up) {
      return up ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M5 12l7 7 7-7";
    }

    function applyPlant(panel, row) {
      var isUp = row.achievementPct != null && row.achievementPct >= 100;

      var values = panel.querySelectorAll(".pp-metric-grid .s-value");
      if (values[0]) values[0].textContent = fmtTon(row.targetTon) + " ton";
      if (values[1]) values[1].textContent = fmtTon(row.actualTon) + " ton";

      var donutPct = panel.querySelector(".donut-pct");
      var donutArc = panel.querySelector(".pp-donut svg circle:nth-of-type(2)");
      if (donutPct) donutPct.textContent = row.yieldPct == null ? "–" : row.yieldPct.toFixed(1) + "%";
      if (donutArc) donutArc.setAttribute("stroke-dasharray", (row.yieldPct == null ? 0 : (row.yieldPct / 100) * DONUT_CIRC).toFixed(1) + " 400");

      var trends = panel.querySelectorAll(".pp-metric-grid .pp-trend");
      if (trends[0]) {
        var variance = row.actualTon - row.targetTon;
        var vSign = variance >= 0 ? "+" : "";
        trends[0].querySelector(".pp-trend-value").textContent = vSign + fmtTon(variance);
        trends[0].querySelector(".pp-trend-label").textContent = "ton vs plan";
        var svg0 = trends[0].querySelector("svg path");
        if (svg0) svg0.setAttribute("d", arrowPath(variance >= 0));
        trends[0].style.background = variance >= 0 ? "var(--success-bg)" : "var(--critical-bg)";
        trends[0].style.color = variance >= 0 ? "var(--success)" : "var(--critical)";
      }
      if (trends[1]) {
        trends[1].querySelector(".pp-trend-value").textContent = row.achievementPct == null ? "–" : row.achievementPct.toFixed(1) + "%";
        trends[1].querySelector(".pp-trend-label").textContent = "Actual/Target";
        var svg1 = trends[1].querySelector("svg path");
        if (svg1) svg1.setAttribute("d", arrowPath(isUp));
        trends[1].style.background = isUp ? "var(--success-bg)" : "var(--critical-bg)";
        trends[1].style.color = isUp ? "var(--success)" : "var(--critical)";
      }

      var pillText = panel.querySelector(".pp-pill");
      if (pillText) {
        var textNode = Array.prototype.filter.call(pillText.childNodes, function (n) { return n.nodeType === 3; }).pop();
        var label = statusLabel(row.achievementPct);
        if (textNode) textNode.textContent = label; else pillText.appendChild(document.createTextNode(label));
        var pillSvgPath = pillText.querySelector("svg path");
        if (pillSvgPath) pillSvgPath.setAttribute("d", arrowPath(isUp));
      }
    }

    function loadDailySummary() {
      fetch("/api/production/daily-plant-summary?date=" + ZB.reportDate)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var rows = data.rows || [];
          var totalActual = 0, totalTarget = 0, totalRm = 0;
          rows.forEach(function (row) {
            var panel = panels.filter(function (p) { return p.dataset.plantKey === row.plant.toLowerCase(); })[0];
            if (panel) applyPlant(panel, row);
            totalActual += row.actualTon || 0;
            totalTarget += row.targetTon || 0;
            totalRm += row.rmWeightTon || 0;
          });

          var totalProdValue = document.getElementById("totalProductionValue");
          var totalProdNote = document.getElementById("totalProductionNote");
          var overallYieldValue = document.getElementById("overallYieldValue");
          var overallYieldNote = document.getElementById("overallYieldNote");
          var achPct = totalTarget > 0 ? (totalActual / totalTarget) * 100 : null;
          var yieldPct = totalRm > 0 ? (totalActual / totalRm) * 100 : null;
          if (totalProdValue) totalProdValue.innerHTML = fmtTon(totalActual) + ' <span class="unit">ton</span>';
          if (totalProdNote) {
            totalProdNote.textContent = (achPct == null ? "–" : achPct.toFixed(1)) + "% of " + fmtTon(totalTarget) + " ton target";
            totalProdNote.className = "stat-note " + (achPct != null && achPct >= 100 ? "good" : "bad");
          }
          if (overallYieldValue) overallYieldValue.innerHTML = (yieldPct == null ? "–" : yieldPct.toFixed(1)) + ' <span class="unit">%</span>';
          if (overallYieldNote) overallYieldNote.textContent = "Actual / RM charged · RMD7 / RMD8 / MSM";
        })
        .catch(function () {});
    }
    loadDailySummary();
  })();

  // ---------------- Equipment Down Time: paginated table + "View All" modal ----------------
  (function () {
    var EQUIPMENT_DATA = [
      { name: "Overhead Crane No.2",     plant: "RMD7", since: "10 Sep 2026", days: 5,  reason: "รออะไหล่ Bearing นำเข้าจากต่างประเทศ",         priority: "high",   eta: "ETA 20 Sep" },
      { name: "Cooling Tower Pump #1",   plant: "MSM",  since: "3 Sep 2026",  days: 12, reason: "รอคิวทีมซ่อมบำรุงกลางเข้าดำเนินการ PM",           priority: "medium", eta: "ETA 18 Sep" },
      { name: "Coiler Motor",            plant: "RMD8", since: "12 Sep 2026", days: 3,  reason: "รอผลตรวจสอบ (Inspection) ก่อนอนุมัติเดินเครื่อง", priority: "low",    eta: "ETA 17 Sep" },
      { name: "Hydraulic Pump #3",       plant: "RMD7", since: "8 Sep 2026",  days: 7,  reason: "รออะไหล่ Seal Kit",                                priority: "medium", eta: "ETA 19 Sep" },
      { name: "Ladle Crane #2",          plant: "MSM",  since: "14 Sep 2026", days: 1,  reason: "ตรวจสอบระบบไฟฟ้า",                                priority: "low",    eta: "ETA 16 Sep" },
      { name: "Descaler Pump",           plant: "RMD8", since: "5 Sep 2026",  days: 10, reason: "รอทีมช่างจากผู้ผลิต",                             priority: "high",   eta: "ETA 21 Sep" },
      { name: "Exhaust Fan #4",          plant: "MSM",  since: "11 Sep 2026", days: 4,  reason: "เปลี่ยนแบริ่งมอเตอร์",                            priority: "medium", eta: "ETA 18 Sep" },
      { name: "Shear Blade Unit",        plant: "RMD7", since: "13 Sep 2026", days: 2,  reason: "รอใบมีดสำรอง",                                    priority: "low",    eta: "ETA 17 Sep" },
      { name: "Walking Beam Furnace #2", plant: "MSM",  since: "2 Sep 2026",  days: 13, reason: "ซ่อมใหญ่ระบบเผาไหม้",                             priority: "high",   eta: "ETA 22 Sep" },
      { name: "Roll Grinder",            plant: "RMD8", since: "9 Sep 2026",  days: 6,  reason: "รอโปรแกรม CNC อัปเดต",                            priority: "medium", eta: "ETA 19 Sep" },
      { name: "Water Treatment Pump",    plant: "MSM",  since: "6 Sep 2026",  days: 9,  reason: "รออะไหล่ Impeller",                               priority: "high",   eta: "ETA 20 Sep" },
      { name: "Billet Conveyor Motor",   plant: "RMD7", since: "15 Sep 2026", days: 1,  reason: "ตรวจสอบสายพาน",                                   priority: "low",    eta: "ETA 16 Sep" }
    ];
    window.__zbPrintData = window.__zbPrintData || {};
    window.__zbPrintData.equipmentData = EQUIPMENT_DATA;
    var PAGE_SIZE = 5;
    var maxDays = Math.max.apply(null, EQUIPMENT_DATA.map(function (r) { return r.days; }));
    var page = 1;
    var totalPages = Math.max(1, Math.ceil(EQUIPMENT_DATA.length / PAGE_SIZE));

    var body = document.getElementById("equipmentBody");
    var pagination = document.getElementById("equipmentPagination");
    var modalBody = document.getElementById("equipmentModalBody");
    var overlay = document.getElementById("equipmentOverlay");
    var viewAllBtn = document.getElementById("equipmentViewAllBtn");
    var closeBtn = document.getElementById("equipmentModalCloseBtn");
    if (!body) return;

    function priorityLabel(p) { return p === "high" ? "High" : p === "medium" ? "Medium" : "Low"; }

    function rowHtml(r) {
      var pct = Math.round(Math.min(100, (r.days / maxDays) * 100));
      return '<tr>' +
        '<td class="line-name">' + r.name + '</td>' +
        '<td>' + r.plant + '</td>' +
        '<td>' + r.since + '</td>' +
        '<td class="num"><span class="eq-bar-track"><span class="eq-bar-fill" style="width:' + pct + '%;"></span></span>' + r.days + (r.days === 1 ? ' day' : ' days') + '</td>' +
        '<td class="reason-cell">' + r.reason + '</td>' +
        '<td><span class="priority-pill ' + r.priority + '">' + priorityLabel(r.priority) + '</span></td>' +
        '<td><span class="eta-tag">' + r.eta + '</span></td>' +
        '</tr>';
    }

    function renderPage() {
      var start = (page - 1) * PAGE_SIZE;
      var rows = EQUIPMENT_DATA.slice(start, start + PAGE_SIZE);
      body.innerHTML = rows.map(rowHtml).join("");

      var infoText = 'Showing ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, EQUIPMENT_DATA.length) + ' of ' + EQUIPMENT_DATA.length + ' units down';
      var controls = '<button class="page-btn" type="button" data-nav="prev"' + (page === 1 ? ' disabled' : '') + ' aria-label="Previous page">&lsaquo;</button>';
      for (var p = 1; p <= totalPages; p++) {
        controls += '<button class="page-btn' + (p === page ? ' active' : '') + '" type="button" data-page="' + p + '">' + p + '</button>';
      }
      controls += '<button class="page-btn" type="button" data-nav="next"' + (page === totalPages ? ' disabled' : '') + ' aria-label="Next page">&rsaquo;</button>';

      pagination.innerHTML = '<span class="pagination-info">' + infoText + '</span><span class="pagination-controls">' + controls + '</span>';

      pagination.querySelectorAll("[data-page]").forEach(function (btn) {
        btn.addEventListener("click", function () { page = parseInt(btn.dataset.page, 10); renderPage(); });
      });
      pagination.querySelectorAll("[data-nav]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (btn.dataset.nav === "prev" && page > 1) page--;
          if (btn.dataset.nav === "next" && page < totalPages) page++;
          renderPage();
        });
      });
    }

    function openModal() {
      if (!overlay || !modalBody) return;
      modalBody.innerHTML = EQUIPMENT_DATA.map(rowHtml).join("");
      overlay.hidden = false;
      document.body.style.overflow = "hidden";
    }
    function closeModal() {
      if (!overlay) return;
      overlay.hidden = true;
      document.body.style.overflow = "";
    }

    if (viewAllBtn) viewAllBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (overlay) {
      overlay.addEventListener("click", function (ev) { if (ev.target === overlay) closeModal(); });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && overlay && !overlay.hidden) closeModal();
    });

    // Print/export always shows every unit, regardless of the on-screen page.
    window.__zbShowAllEquipmentForPrint = function () {
      body.innerHTML = EQUIPMENT_DATA.map(rowHtml).join("");
    };
    window.__zbRestoreEquipmentPageAfterPrint = function () {
      renderPage();
    };

    renderPage();
  })();

  // ---------------- Curated headline-only summary, used by both Print and Export PNG ----------------
  (function () {
    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
    function textOf(el) { return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; }

    function buildPrintSummary() {
      var psGrid = document.getElementById("psGrid");
      if (!psGrid) return;
      var data = window.__zbPrintData || {};
      var blocks = [];

      // 01: Production Daily
      var prodRows = [];
      document.querySelectorAll(".plant-panel").forEach(function (panel) {
        var code = panel.querySelector(".pp-code");
        if (!code) return;
        var pill = panel.querySelector(".pp-pill");
        var values = panel.querySelectorAll(".pp-metric-grid .s-value");
        var trendValues = panel.querySelectorAll(".pp-metric-grid .pp-trend-value");
        var yieldPct = panel.querySelector(".donut-pct");
        var highlight = panel.querySelector(".h-text");
        var pillText = textOf(pill);
        var pillClass = /below|significantly/i.test(pillText) ? "bad" : "good";
        prodRows.push(
          "<li><b>" + esc(textOf(code)) + "</b> &mdash; Actual " + esc(textOf(values[1])) + " / Target " + esc(textOf(values[0])) +
          " (" + esc(textOf(trendValues[1])) + ") &middot; Yield " + esc(textOf(yieldPct)) +
          (pillText ? '<span class="ps-pill ' + pillClass + '">' + esc(pillText) + "</span>" : "") +
          "<br><span class=\"ps-note\">" + esc(textOf(highlight)) + "</span></li>"
        );
      });
      blocks.push(
        '<div class="ps-block"><div class="ps-block-title">01 &middot; Production Daily</div><ul class="ps-list">' +
        (prodRows.length ? prodRows.join("") : '<li class="ps-empty">No data</li>') + "</ul></div>"
      );

      // 02: Downtime - top 5 by duration, all plants
      var dtAll = data.downtimeData || [];
      var dtTop = dtAll.slice().sort(function (a, b) { return b.duration - a.duration; }).slice(0, 5);
      var dtTotalMin = dtAll.reduce(function (s, r) { return s + r.duration; }, 0);
      var dtTotalOcc = dtAll.reduce(function (s, r) { return s + r.occ; }, 0);
      var dtRows = dtTop.map(function (r) {
        return "<li><b>" + esc(r.plantLabel) + "</b> " + esc(r.cause) + " &mdash; " + r.duration + " min (" + r.occ + "x)</li>";
      });
      blocks.push(
        '<div class="ps-block"><div class="ps-block-title">02 &middot; Downtime &mdash; ' + dtTotalMin + ' min / ' + dtTotalOcc + ' occ.</div><ul class="ps-list">' +
        (dtRows.length ? dtRows.join("") : '<li class="ps-empty">No downtime recorded</li>') + "</ul></div>"
      );

      // 03: PM Execution
      var pmRows = [];
      var pmProgress = document.querySelector(".pm-today-progress-value");
      var pmStats = document.querySelectorAll(".pm-stats-grid .stat-value");
      var pmText = document.querySelector(".pm-highlight-text");
      if (pmProgress) pmRows.push("<li>Today: <b>" + esc(textOf(pmProgress)) + "</b></li>");
      if (pmStats[2] && pmStats[3]) pmRows.push("<li>YTD: <b>" + esc(textOf(pmStats[3])) + "</b> / " + esc(textOf(pmStats[2])) + "</li>");
      if (pmText) pmRows.push('<li class="ps-note">' + esc(textOf(pmText)) + "</li>");
      blocks.push(
        '<div class="ps-block"><div class="ps-block-title">03 &middot; PM Execution</div><ul class="ps-list">' +
        (pmRows.length ? pmRows.join("") : '<li class="ps-empty">No data</li>') + "</ul></div>"
      );

      // 04: Quality Issue
      var qaTotal = document.querySelector(".qa-total-tile .stat-value");
      var qaRows = [];
      document.querySelectorAll(".qa-layout table.rpt tbody tr").forEach(function (tr) {
        var tds = tr.querySelectorAll("td");
        if (tds.length >= 3) {
          qaRows.push("<li>" + esc(textOf(tds[0])) + " &middot; " + esc(textOf(tds[1])) + " &middot; <b>" + esc(textOf(tds[2])) + "</b></li>");
        }
      });
      blocks.push(
        '<div class="ps-block"><div class="ps-block-title">04 &middot; Quality Issue' + (qaTotal ? " &mdash; " + esc(textOf(qaTotal)) : "") + '</div><ul class="ps-list">' +
        (qaRows.length ? qaRows.join("") : '<li class="ps-empty">No defects reported</li>') + "</ul></div>"
      );

      // 05: SHE
      var lti = data.ltiStatus;
      var sheRows = (data.sheIncidents || []).slice(0, 5).map(function (i) {
        return "<li>" + esc(i.title) + ' <span class="ps-pill ' + (i.status === "resolved" ? "good" : "warn") + '">' + esc(i.status) + "</span></li>";
      });
      blocks.push(
        '<div class="ps-block"><div class="ps-block-title">05 &middot; SHE' + (lti && lti.daysWithoutLti != null ? " &mdash; " + lti.daysWithoutLti + " days without LTI" : "") + '</div><ul class="ps-list">' +
        (sheRows.length ? sheRows.join("") : '<li class="ps-empty">No SHE items today</li>') + "</ul></div>"
      );

      // 06: Equipment Down Time - top 3 by days down
      var eqTop = (data.equipmentData || []).slice().sort(function (a, b) { return b.days - a.days; }).slice(0, 3);
      var eqRows = eqTop.map(function (r) {
        var pClass = r.priority === "high" ? "bad" : r.priority === "medium" ? "warn" : "good";
        return "<li><b>" + esc(r.name) + "</b> (" + esc(r.plant) + ") " + r.days + "d <span class=\"ps-pill " + pClass + "\">" + esc(r.priority) + "</span></li>";
      });
      blocks.push(
        '<div class="ps-block"><div class="ps-block-title">06 &middot; Equipment Down Time</div><ul class="ps-list">' +
        (eqRows.length ? eqRows.join("") : '<li class="ps-empty">No equipment down</li>') + "</ul></div>"
      );

      psGrid.innerHTML = blocks.join("");
    }

    window.__zbBuildPrintSummary = buildPrintSummary;
  })();

  // ---------------- Fit the printed page (now just the curated summary) to A4 ----------------
  function fitToOnePage() {
    document.documentElement.style.zoom = "";
    var mmToPx = 96 / 25.4;
    var pageH = 210 * mmToPx;   // A4 landscape printable height
    var margin = 8 * mmToPx * 2; // top + bottom @page margin
    var available = pageH - margin;
    var target = document.getElementById("printSummary");
    var contentH = target ? target.scrollHeight : document.body.scrollHeight;
    var scale = Math.min(1, available / contentH);
    document.documentElement.style.zoom = scale;
  }
  window.addEventListener("beforeprint", function () {
    if (window.__zbBuildPrintSummary) window.__zbBuildPrintSummary();
    fitToOnePage();
  });
  window.addEventListener("afterprint", function () {
    document.documentElement.style.zoom = "";
  });

  var printBtn = document.getElementById("printBtn");
  var exportBtn = document.getElementById("exportBtn");
  if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
  if (exportBtn) exportBtn.addEventListener("click", function () {
    if (window.__zbBuildPrintSummary) window.__zbBuildPrintSummary();
    var target = document.getElementById("printSummary");
    if (!target || typeof html2canvas === "undefined") { window.print(); return; }
    exportBtn.disabled = true;
    target.classList.add("ps-force-visible");
    html2canvas(target, { scale: 2, backgroundColor: "#ffffff" }).then(function (canvas) {
      target.classList.remove("ps-force-visible");
      exportBtn.disabled = false;
      var link = document.createElement("a");
      link.download = "executive-production-report-2026-09-15.png";
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }).catch(function () {
      target.classList.remove("ps-force-visible");
      exportBtn.disabled = false;
      window.print();
    });
  });

  // ---------------- Editable plant highlights: persisted via API, identity from ?currentUser=<empCode> ----------------
  (function () {
    var REPORT_DATE = ZB.reportDate;
    var PLANT_LABEL = { rmd7: "RMD7", rmd8: "RMD8", msm: "MSM" };
    var escapeHtml = ZB.escapeHtml, fmtDateTime = ZB.fmtDateTime;

    var fields = document.querySelectorAll(".h-text[contenteditable]");
    var metaEls = {};
    document.querySelectorAll(".h-meta[data-key]").forEach(function (el) { metaEls[el.dataset.key] = el; });
    var lastSaved = {};
    var currentUser = null; // { code, name, position } once resolved, else null

    function renderMeta(key, record) {
      var el = metaEls[key];
      if (!el) return;
      el.classList.remove("saving", "err");
      if (!record) {
        el.textContent = "ยังไม่มีการบันทึกจากระบบ (แสดงข้อความตัวอย่าง)";
        return;
      }
      el.innerHTML = "แก้ไขล่าสุดโดย <span class=\"h-meta-name\">" + escapeHtml(record.updatedBy.name) + "</span>" +
        (record.updatedBy.position ? " (" + escapeHtml(record.updatedBy.position) + ")" : "") +
        " &middot; " + escapeHtml(fmtDateTime(record.updatedAt));
    }

    function loadHighlight(key) {
      var plant = PLANT_LABEL[key];
      fetch("/api/production/highlight?date=" + REPORT_DATE + "&plant=" + plant)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var field = document.querySelector('.h-text[data-key="' + key + '"]');
          if (data.record) {
            if (field) field.textContent = data.record.text;
            lastSaved[key] = data.record.text;
          } else if (field) {
            lastSaved[key] = field.textContent.trim();
          }
          renderMeta(key, data.record);
        })
        .catch(function () {
          var el = metaEls[key];
          if (el) el.textContent = "โหลดข้อมูลไม่สำเร็จ";
        });
    }
    Object.keys(PLANT_LABEL).forEach(loadHighlight);

    // ---- Fields are editable once identity resolves via the shared promise ----
    function setFieldsEditable(editable) {
      fields.forEach(function (field) { field.contentEditable = editable ? "true" : "false"; });
      document.querySelectorAll(".pp-highlight .edit-hint").forEach(function (hint) {
        hint.style.display = editable ? "" : "none";
      });
    }
    setFieldsEditable(false);
    ZB.currentUserPromise.then(function (user) {
      currentUser = user;
      setFieldsEditable(!!user);
    });

    // ---- Save directly using currentUser, no confirm modal ----
    function saveHighlight(key, text) {
      var el = metaEls[key];
      if (el) { el.textContent = "กำลังบันทึก…"; el.classList.add("saving"); el.classList.remove("err"); }

      fetch("/api/production/highlight", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: REPORT_DATE, plant: PLANT_LABEL[key], text: text, empCode: currentUser.code })
      })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (!res.ok) {
            if (el) { el.textContent = res.data.message || "บันทึกไม่สำเร็จ"; el.classList.remove("saving"); el.classList.add("err"); }
            return;
          }
          lastSaved[key] = res.data.record.text;
          renderMeta(key, res.data.record);
        })
        .catch(function () {
          if (el) { el.textContent = "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ"; el.classList.remove("saving"); el.classList.add("err"); }
        });
    }

    fields.forEach(function (field) {
      var key = field.dataset.key;
      field.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); field.blur(); }
        if (ev.key === "Escape") { field.textContent = lastSaved[key] || field.textContent; field.blur(); }
      });
      field.addEventListener("blur", function () {
        var text = field.textContent.replace(/\s+/g, " ").trim();
        field.textContent = text;
        if (!currentUser || text === (lastSaved[key] || "")) return;
        saveHighlight(key, text);
      });
    });

    // ---- History (generic modal) ----
    document.querySelectorAll(".h-history-btn[data-key]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.dataset.key;
        ZB.openHistory(PLANT_LABEL[key] + " Highlight History", PLANT_LABEL[key] + " · " + REPORT_DATE,
          "/api/production/highlight/history?date=" + REPORT_DATE + "&plant=" + PLANT_LABEL[key],
          function (row) {
            return '<div class="hl-history-item">' +
              '<div class="hl-history-head"><span>' + escapeHtml(row.editedBy.name) + (row.editedBy.position ? ' (' + escapeHtml(row.editedBy.position) + ')' : '') + '</span><span>' + escapeHtml(fmtDateTime(row.editedAt)) + '</span></div>' +
              '<div class="hl-history-text">' + escapeHtml(row.text) + '</div>' +
              '</div>';
          });
      });
    });
  })();

  // ---------------- SHE Highlight: Days-without-LTI tracker + incident list, persisted via API ----------------
  (function () {
    var REPORT_DATE = ZB.reportDate;
    var escapeHtml = ZB.escapeHtml, fmtDateTime = ZB.fmtDateTime;
    var currentUser = null;

    var ltiValueEl = document.getElementById("ltiValue");
    var ltiMetaEl = document.getElementById("ltiMeta");
    var ltiDateInput = document.getElementById("ltiDateInput");
    var ltiHistoryBtn = document.getElementById("ltiHistoryBtn");
    var sheAddBtn = document.getElementById("sheAddBtn");
    var sheList = document.getElementById("sheList");
    var lastLtiDate = null;

    function renderLtiMeta(status) {
      if (!status || !status.updatedBy) {
        ltiMetaEl.textContent = "ยังไม่มีการบันทึกจากระบบ";
        return;
      }
      ltiMetaEl.innerHTML = "อัปเดตล่าสุดโดย <span class=\"h-meta-name\">" + escapeHtml(status.updatedBy.name) + "</span>" +
        (status.updatedBy.position ? " (" + escapeHtml(status.updatedBy.position) + ")" : "") +
        " &middot; " + escapeHtml(fmtDateTime(status.updatedAt));
    }

    function applyLtiStatus(status) {
      window.__zbPrintData = window.__zbPrintData || {};
      window.__zbPrintData.ltiStatus = status;
      lastLtiDate = status.lastLtiDate;
      ltiValueEl.textContent = status.daysWithoutLti == null ? "–" : status.daysWithoutLti;
      ltiDateInput.value = status.lastLtiDate || "";
      ltiMetaEl.classList.remove("saving", "err");
      renderLtiMeta(status);
    }

    function loadLti() {
      fetch("/api/she/lti?asOfDate=" + REPORT_DATE)
        .then(function (r) { return r.json(); })
        .then(function (data) { applyLtiStatus(data.status); })
        .catch(function () { ltiMetaEl.textContent = "โหลดข้อมูลไม่สำเร็จ"; });
    }
    loadLti();

    ltiDateInput.addEventListener("change", function () {
      if (!currentUser) return;
      var newDate = ltiDateInput.value;
      if (!newDate || newDate === lastLtiDate) return;
      ltiMetaEl.textContent = "กำลังบันทึก…";
      ltiMetaEl.classList.add("saving");
      fetch("/api/she/lti", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastLtiDate: newDate, empCode: currentUser.code, asOfDate: REPORT_DATE })
      })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (!res.ok) {
            ltiMetaEl.classList.remove("saving");
            ltiMetaEl.classList.add("err");
            ltiMetaEl.textContent = res.data.message || "บันทึกไม่สำเร็จ";
            return;
          }
          applyLtiStatus(res.data.status);
        })
        .catch(function () {
          ltiMetaEl.classList.remove("saving");
          ltiMetaEl.classList.add("err");
          ltiMetaEl.textContent = "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ";
        });
    });

    ltiHistoryBtn.addEventListener("click", function () {
      ZB.openHistory("LTI History", "Days without LTI · edit log", "/api/she/lti/history", function (row) {
        return '<div class="hl-history-item">' +
          '<div class="hl-history-head"><span>' + escapeHtml(row.editedBy.name) + (row.editedBy.position ? ' (' + escapeHtml(row.editedBy.position) + ')' : '') + '</span><span>' + escapeHtml(fmtDateTime(row.editedAt)) + '</span></div>' +
          '<div class="hl-history-text">Last LTI date set to ' + escapeHtml(row.lastLtiDate) + '</div>' +
          '</div>';
      });
    });

    // ---- Incidents ----
    var incidents = [];

    function incidentIcon(status) {
      if (status === "resolved") {
        return '<span class="she-icon" style="background:var(--success-bg); color:var(--success);"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>';
      }
      return '<span class="she-icon" style="background:var(--warning-bg); color:var(--warning-ink);"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L2.7 17.5a1.8 1.8 0 0 0 1.6 2.6h15.4a1.8 1.8 0 0 0 1.6-2.6L13.7 3.9a1.8 1.8 0 0 0-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="16.3" r=".4" fill="currentColor" stroke="none"/></svg></span>';
    }
    function metaLine(row) {
      var parts = [];
      if (row.plant) parts.push(escapeHtml(row.plant));
      if (row.location) parts.push(escapeHtml(row.location));
      if (row.occurredTime) parts.push(escapeHtml(row.occurredTime));
      return parts.join(" &middot; ");
    }
    function incidentCardHtml(row) {
      var who = row.updatedBy || row.createdBy;
      var when = row.updatedAt || row.createdAt;
      return '<div class="card she-item" data-id="' + row.id + '">' +
        incidentIcon(row.status) +
        '<div class="she-body">' +
          '<div class="she-head">' +
            '<span class="she-title h-text" data-field="title" spellcheck="false" contenteditable="false">' + escapeHtml(row.title) + '</span>' +
            '<select class="status-select ' + row.status + '" data-field="status" disabled>' +
              '<option value="monitoring"' + (row.status === "monitoring" ? " selected" : "") + '>Monitoring</option>' +
              '<option value="resolved"' + (row.status === "resolved" ? " selected" : "") + '>Resolved</option>' +
            '</select>' +
          '</div>' +
          '<div class="she-text h-text" data-field="description" spellcheck="false" contenteditable="false">' + escapeHtml(row.description || "") + '</div>' +
          '<div class="highlight-meta">' + metaLine(row) + '</div>' +
          '<div class="h-meta">อัปเดตล่าสุดโดย <span class="h-meta-name">' + escapeHtml(who.name) + '</span> &middot; ' + escapeHtml(fmtDateTime(when)) + '</div>' +
        '</div>' +
        '<button class="h-history-btn" type="button" data-id="' + row.id + '" title="History" aria-label="View SHE item history">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
        '</button>' +
      '</div>';
    }

    function saveIncidentField(id, patch) {
      var incident = incidents.find(function (r) { return r.id === id; });
      if (!incident || !currentUser) return;
      fetch("/api/she/incident/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: patch.title != null ? patch.title : incident.title,
          description: patch.description != null ? patch.description : incident.description,
          location: incident.location,
          occurredTime: incident.occurredTime,
          status: patch.status != null ? patch.status : incident.status,
          empCode: currentUser.code
        })
      })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (!res.ok) return;
          var idx = incidents.findIndex(function (r) { return r.id === id; });
          if (idx >= 0) incidents[idx] = res.data.incident;
          renderIncidents();
        });
    }

    function wireIncidentCards() {
      sheList.querySelectorAll(".she-item").forEach(function (card) {
        var id = Number(card.dataset.id);
        var titleEl = card.querySelector('[data-field="title"]');
        var descEl = card.querySelector('[data-field="description"]');
        var statusEl = card.querySelector('[data-field="status"]');

        [titleEl, descEl].forEach(function (el) {
          el.contentEditable = currentUser ? "true" : "false";
          el.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); el.blur(); } });
          el.addEventListener("blur", function () {
            var text = el.textContent.replace(/\s+/g, " ").trim();
            el.textContent = text;
            var patch = {};
            patch[el.dataset.field] = text;
            saveIncidentField(id, patch);
          });
        });

        statusEl.disabled = !currentUser;
        statusEl.addEventListener("change", function () {
          statusEl.className = "status-select " + statusEl.value;
          saveIncidentField(id, { status: statusEl.value });
        });

        card.querySelector(".h-history-btn").addEventListener("click", function () {
          ZB.openHistory("SHE Item History", "Incident #" + id, "/api/she/incident/history?id=" + id, function (row) {
            return '<div class="hl-history-item">' +
              '<div class="hl-history-head"><span>' + escapeHtml(row.editedBy.name) + (row.editedBy.position ? ' (' + escapeHtml(row.editedBy.position) + ')' : '') + '</span><span>' + escapeHtml(fmtDateTime(row.editedAt)) + '</span></div>' +
              '<div class="hl-history-text"><b>' + escapeHtml(row.title) + '</b> (' + escapeHtml(row.status) + ')<br>' + escapeHtml(row.description || "") + '</div>' +
              '</div>';
          });
        });
      });
    }

    function renderIncidents() {
      window.__zbPrintData = window.__zbPrintData || {};
      window.__zbPrintData.sheIncidents = incidents;
      sheList.innerHTML = incidents.length
        ? incidents.map(incidentCardHtml).join("")
        : '<div class="she-empty">ยังไม่มีรายการ SHE สำหรับวันนี้</div>';
      wireIncidentCards();
    }

    function loadIncidents() {
      fetch("/api/she/incident?date=" + REPORT_DATE)
        .then(function (r) { return r.json(); })
        .then(function (data) { incidents = data.rows || []; renderIncidents(); })
        .catch(function () { sheList.innerHTML = '<div class="she-empty">โหลดข้อมูลไม่สำเร็จ</div>'; });
    }
    loadIncidents();

    // ---- Add new incident (inline form, no overlay) ----
    var addFormOpen = false;
    function addFormHtml() {
      return '<div class="card hl-form" id="sheAddForm" style="padding:16px;">' +
        '<input class="hl-form-input" type="text" id="sheAddTitle" placeholder="หัวข้อ เช่น Near Miss — ...">' +
        '<textarea class="hl-form-input" id="sheAddDescription" rows="2" placeholder="รายละเอียด"></textarea>' +
        '<div class="hl-form-row">' +
          '<select class="hl-form-input" id="sheAddPlant"><option value="">Company-wide</option><option value="RMD7">RMD7</option><option value="RMD8">RMD8</option><option value="MSM">MSM</option></select>' +
          '<input class="hl-form-input" type="text" id="sheAddLocation" placeholder="สถานที่">' +
        '</div>' +
        '<div class="hl-form-row">' +
          '<input class="hl-form-input" type="text" id="sheAddTime" placeholder="เวลา เช่น 10:45 หรือ ตลอดวัน">' +
          '<select class="hl-form-input" id="sheAddStatus"><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select>' +
        '</div>' +
        '<div class="hl-form-status" id="sheAddStatusMsg"></div>' +
        '<div class="hl-form-actions">' +
          '<button class="btn" type="button" id="sheAddCancelBtn">ยกเลิก</button>' +
          '<button class="btn primary" type="button" id="sheAddSaveBtn">บันทึก</button>' +
        '</div>' +
      '</div>';
    }
    function closeAddForm() {
      var form = document.getElementById("sheAddForm");
      if (form) form.remove();
      addFormOpen = false;
    }
    function submitAddForm() {
      var title = document.getElementById("sheAddTitle").value.trim();
      var statusMsg = document.getElementById("sheAddStatusMsg");
      if (!title) { statusMsg.textContent = "กรุณากรอกหัวข้อ"; statusMsg.className = "hl-form-status err"; return; }
      if (!currentUser) { statusMsg.textContent = "ไม่พบตัวตนผู้ใช้งาน"; statusMsg.className = "hl-form-status err"; return; }
      statusMsg.textContent = "กำลังบันทึก…";
      statusMsg.className = "hl-form-status";
      fetch("/api/she/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate: REPORT_DATE,
          plant: document.getElementById("sheAddPlant").value || null,
          title: title,
          description: document.getElementById("sheAddDescription").value.trim() || null,
          location: document.getElementById("sheAddLocation").value.trim() || null,
          occurredTime: document.getElementById("sheAddTime").value.trim() || null,
          status: document.getElementById("sheAddStatus").value,
          empCode: currentUser.code
        })
      })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (!res.ok) { statusMsg.textContent = res.data.message || "บันทึกไม่สำเร็จ"; statusMsg.className = "hl-form-status err"; return; }
          incidents.unshift(res.data.incident);
          closeAddForm();
          renderIncidents();
        })
        .catch(function () { statusMsg.textContent = "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ"; statusMsg.className = "hl-form-status err"; });
    }
    sheAddBtn.addEventListener("click", function () {
      if (addFormOpen) return;
      addFormOpen = true;
      sheList.insertAdjacentHTML("afterbegin", addFormHtml());
      document.getElementById("sheAddCancelBtn").addEventListener("click", closeAddForm);
      document.getElementById("sheAddSaveBtn").addEventListener("click", submitAddForm);
    });

    ZB.currentUserPromise.then(function (user) {
      currentUser = user;
      ltiDateInput.disabled = !user;
      sheAddBtn.hidden = !user;
      renderIncidents();
    });
  })();

  // ---------------- Plant trend modal (Weekly / Monthly / YTD) ----------------
  (function () {
    var PLANTS = {
      rmd7: { code: "RMD7", full: "Rolling Mill 7", tier: "tier-blue" },
      rmd8: { code: "RMD8", full: "Rolling Mill 8", tier: "tier-green" },
      msm:  { code: "MSM",  full: "Steel Melting",  tier: "tier-orange" }
    };
    var PERIODS = {
      weekly:  { note: "Last 7 days, ending 15 Sep 2026" },
      monthly: { note: "Last 4 weeks, ending 15 Sep 2026" },
      yearly:  { note: "Jan – Sep 2026" },
      ytd:     { note: "Cumulative · Jan – Sep 2026", cumulative: true, base: "yearly" }
    };

    // Real production data from dbo.tbl_prd_summary_new (SQL_SERVER_HOST), snapshot as of 15 Sep 2026.
    // "msm" is sourced from prd_plant = 'SMD' (aliased to MSM in this report, same convention as src/lib/constants/plants.ts).
    var TREND_DATA = {"rmd7":{"weekly":{"labels":["Wed","Thu","Fri","Sat","Sun","Mon","Tue"],"actual":[166,323,262,594,648,0,202],"target":[352,352,352,640,640,0,300],"yieldPct":[93.1,100,100,100,100,null,94.1],"lastYearActual":[527,139,733,216,867,0,424],"lastYearYieldPct":[100,100,100,100,100,null,100]},"monthly":{"labels":["Week 1","Week 2","Week 3","Week 4"],"actual":[0,41,2670,2195],"target":[0,270,3211,2636],"yieldPct":[null,46.3,99,98.9],"lastYearActual":[2218,3087,2408,2905],"lastYearYieldPct":[99.7,99.6,100,100]},"yearly":{"labels":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"],"actual":[9689,13592,11117,13230,11732,13490,0,0,5436],"target":[18834,32736,28187,24400,21906,19232,0,0,11185],"yieldPct":[99.8,100,100,99.7,99.9,99.6,null,null,97.4],"lastYearActual":[0,0,0,5543,8465,8313,10142,10412,11320],"lastYearYieldPct":[null,null,null,96.4,98.7,96.1,96.5,99.3,99.9]}},"rmd8":{"weekly":{"labels":["Wed","Thu","Fri","Sat","Sun","Mon","Tue"],"actual":[569,1102,956,1215,1309,357,440],"target":[1876,1340,984,1180,1300,561,429],"yieldPct":[98,99.5,99.7,99.5,99.4,99,98.2],"lastYearActual":[323,1078,689,1085,960,919,738],"lastYearYieldPct":[96.2,100,100,100,100,100,99.5]},"monthly":{"labels":["Week 1","Week 2","Week 3","Week 4"],"actual":[4173,4295,3132,5947],"target":[5136,4723,6390,7670],"yieldPct":[99.3,95.4,89.1,99.2],"lastYearActual":[4373,4586,3759,5792],"lastYearYieldPct":[99.9,99.6,99.9,99.7]},"yearly":{"labels":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"],"actual":[20852,18170,19711,6558,26013,11630,0,15418,10620],"target":[25647,22735,19598,9821,24799,19540,0,17974,24426],"yieldPct":[99.7,99.7,99.2,98.9,98.6,93,null,93,95.9],"lastYearActual":[25162,25361,16038,0,0,10386,27891,24767,22107],"lastYearYieldPct":[95.5,99.2,91.8,null,null,97.9,99,99.5,99.2]}},"msm":{"weekly":{"labels":["Wed","Thu","Fri","Sat","Sun","Mon","Tue"],"actual":[0,578,578,710,706,569,554],"target":[0,561,561,714,714,561,561],"yieldPct":[null,100,100,100,100,100,100],"lastYearActual":[527,288,540,691,628,0,571],"lastYearYieldPct":[100,100,100,100,100,null,100]},"monthly":{"labels":["Week 1","Week 2","Week 3","Week 4"],"actual":[3566,1613,2125,3694],"target":[4131,2244,2550,3672],"yieldPct":[100,100,100,100],"lastYearActual":[1250,0,1411,3244],"lastYearYieldPct":[100,null,100,100]},"yearly":{"labels":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"],"actual":[14595,14826,15002,3041,0,0,0,15376,6174],"target":[14896,15810,15453,4233,0,0,0,18768,14688],"yieldPct":[100,100,100,100,null,null,null,100,100],"lastYearActual":[0,0,0,0,0,880,8780,4458,11050],"lastYearYieldPct":[null,null,null,null,null,100,100,100,100]}}};

    var overlay = document.getElementById("trendOverlay");
    var modal = document.getElementById("trendModal");
    var header = document.getElementById("trendHeader");
    var codeEl = document.getElementById("trendPlantCode");
    var fullEl = document.getElementById("trendPlantFull");
    var closeBtn = document.getElementById("trendCloseBtn");
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".trend-tab"));
    var yieldNote = document.getElementById("trendYieldNote");
    var actualSwatch = document.getElementById("trendProdActualSwatch");

    var state = { plant: null, period: "weekly" };

    function genSeries(plantKey, periodKey) {
      var period = PERIODS[periodKey];

      // Cumulative (YTD) view: accumulate the underlying monthly ("yearly") series
      // so the running totals stay consistent with the Yearly tab's per-month figures.
      if (period.cumulative) {
        var monthly = genSeries(plantKey, period.base);
        var cumActual = [], cumTarget = [], cumYield = [], cumLY = [], cumLYYield = [];
        var runActual = 0, runTarget = 0, runWeightedYield = 0, runLY = 0, runWeightedLYYield = 0;
        monthly.labels.forEach(function (label, i) {
          runActual += monthly.actual[i];
          runTarget += monthly.target[i];
          runWeightedYield += monthly.actual[i] * (monthly.yieldPct[i] || 0);
          runLY += monthly.lastYearActual[i];
          runWeightedLYYield += monthly.lastYearActual[i] * (monthly.lastYearYieldPct[i] || 0);
          cumActual.push(runActual);
          cumTarget.push(runTarget);
          cumYield.push(runActual > 0 ? Math.round((runWeightedYield / runActual) * 10) / 10 : null);
          cumLY.push(runLY);
          cumLYYield.push(runLY > 0 ? Math.round((runWeightedLYYield / runLY) * 10) / 10 : null);
        });
        return { labels: monthly.labels, actual: cumActual, target: cumTarget, yieldPct: cumYield, lastYearActual: cumLY, lastYearYieldPct: cumLYYield };
      }

      return TREND_DATA[plantKey][periodKey];
    }

    function drawProdChart(data) {
      var svg = document.getElementById("trendProdSvg");
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var W = 640, H = 190, padL = 46, padR = 12, padT = 12, padB = 26;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var border = cssVar("--border-soft"), inkMuted = cssVar("--ink-muted"), ink = cssVar("--ink");
      var accent = PLANTS[state.plant].tier === "tier-blue" ? cssVar("--tier-blue") : PLANTS[state.plant].tier === "tier-green" ? cssVar("--tier-green") : cssVar("--tier-orange");
      if (actualSwatch) actualSwatch.style.background = accent;
      var lySwatch = document.getElementById("trendProdLastYearSwatch");
      if (lySwatch) lySwatch.style.background = inkMuted;

      var n = data.labels.length;
      var isYTD = state.period === "ytd";
      var ytdTarget = data.target[data.target.length - 1];
      var allVals = data.actual.concat(data.target).concat(data.lastYearActual).concat([0]);
      var maxVal = Math.max.apply(null, allVals) * 1.15;
      var minVal = 0; // bars always start at a true zero baseline
      var groupW = plotW / n;
      var barW = Math.min(20, groupW / 2 - 5);
      function xFor(i) { return padL + i * groupW + groupW / 2; }
      function yFor(v) { return padT + plotH - ((v - minVal) / (maxVal - minVal)) * plotH; }

      var yTicks = 4;
      for (var t = 0; t <= yTicks; t++) {
        var v = minVal + (t / yTicks) * (maxVal - minVal);
        var y = yFor(v);
        svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: border, "stroke-width": 1 }));
        var lbl = el("text", { x: padL - 8, y: y + 4, "text-anchor": "end", "font-size": 10.5, fill: inkMuted, "font-variant-numeric": "tabular-nums" });
        lbl.textContent = Math.round(v / 100) / 10 + "k";
        svg.appendChild(lbl);
      }
      data.labels.forEach(function (label, i) {
        var lbl = el("text", { x: xFor(i), y: H - 7, "text-anchor": "middle", "font-size": 10.5, fill: inkMuted });
        lbl.textContent = label;
        svg.appendChild(lbl);
      });

      var tip = document.getElementById("trendProdTip");
      var hitGroup = el("g", {});
      data.labels.forEach(function (label, i) {
        var cx = xFor(i);
        var xLY = cx - 2 - barW;
        var xAct = cx + 2;

        var lyRect = el("rect", { x: xLY, y: yFor(data.lastYearActual[i]), width: barW, height: plotH - (yFor(data.lastYearActual[i]) - padT), rx: 3, fill: inkMuted, opacity: 0.55 });
        var actRect = el("rect", { x: xAct, y: yFor(data.actual[i]), width: barW, height: plotH - (yFor(data.actual[i]) - padT), rx: 3, fill: accent });
        svg.appendChild(lyRect);
        svg.appendChild(actRect);

        var hit = el("rect", { x: cx - groupW / 2, y: padT, width: groupW, height: plotH, fill: "transparent" });
        hit.style.cursor = "pointer";
        hit.addEventListener("mouseenter", function () {
          actRect.setAttribute("opacity", 0.82); lyRect.setAttribute("opacity", 0.82);
          var rect = svg.getBoundingClientRect(); var scale = rect.width / W;
          tip.style.left = (cx * scale) + "px";
          tip.style.top = (yFor(Math.max(data.actual[i], data.target[i])) * scale) + "px";
          var variance = data.actual[i] - data.target[i];
          var vSign = variance >= 0 ? "+" : "";
          var yoy = data.actual[i] - data.lastYearActual[i];
          var yoyPct = data.lastYearActual[i] > 0 ? Math.round((yoy / data.lastYearActual[i]) * 1000) / 10 : null;
          tip.innerHTML = '<div class="t-title">' + label + '</div>' +
            '<div class="t-row"><span class="t-dot" style="background:' + accent + '"></span>Actual &nbsp;' + data.actual[i].toLocaleString() + ' ton</div>' +
            '<div class="t-row"><span class="t-dot" style="background:' + inkMuted + '"></span>Target &nbsp;' + data.target[i].toLocaleString() + ' ton</div>' +
            '<div class="t-row"><span class="t-dot" style="background:' + inkMuted + '; opacity:.55;"></span>Last Year &nbsp;' + data.lastYearActual[i].toLocaleString() + ' ton</div>' +
            '<div style="margin-top:3px; color:' + (variance >= 0 ? cssVar('--success') : cssVar('--critical')) + '">' + vSign + variance.toLocaleString() + ' ton vs target</div>' +
            (yoyPct === null ? '' : '<div style="color:' + (yoy >= 0 ? cssVar('--success') : cssVar('--critical')) + '">' + (yoy >= 0 ? "+" : "") + yoyPct + '% vs last year</div>');
          tip.classList.add("visible");
        });
        hit.addEventListener("mouseleave", function () { actRect.setAttribute("opacity", 1); lyRect.setAttribute("opacity", 0.55); tip.classList.remove("visible"); });
        hitGroup.appendChild(hit);
      });
      svg.appendChild(hitGroup);

      // Target reference: YTD shows one flat line for the full-year target;
      // other periods show a short dashed tick per bar group (each period's own target).
      if (isYTD) {
        var ay = yFor(ytdTarget);
        svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: ay, y2: ay, stroke: ink, "stroke-width": 1.8, "stroke-dasharray": "5 5", "stroke-linecap": "round" }));
        var ayLabel = el("text", { x: W - padR, y: ay - 6, "text-anchor": "end", "font-size": 10.5, "font-weight": 700, fill: ink, "font-variant-numeric": "tabular-nums" });
        ayLabel.textContent = "YTD target " + Math.round(ytdTarget / 1000 * 10) / 10 + "k ton";
        svg.appendChild(ayLabel);
      } else {
        var targetPath = data.target.map(function (v, i) { return (i === 0 ? "M" : "L") + (xFor(i) - groupW / 2 + 4) + "," + yFor(v) + " L" + (xFor(i) + groupW / 2 - 4) + "," + yFor(v); }).join(" ");
        svg.appendChild(el("path", { d: targetPath, fill: "none", stroke: ink, "stroke-width": 1.8, "stroke-dasharray": "4 4", "stroke-linecap": "round" }));
      }
    }

    function drawYieldChart(data) {
      var svg = document.getElementById("trendYieldSvg");
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var W = 640, H = 140, padL = 40, padR = 12, padT = 12, padB = 26;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var border = cssVar("--border-soft"), inkMuted = cssVar("--ink-muted");
      var success = cssVar("--success");

      var maxVal = 100, minVal = 0; // percentage bars always start at zero
      var n = data.labels.length;
      var groupW = plotW / n;
      var barW = Math.min(20, groupW / 2 - 5);
      function xFor(i) { return padL + i * groupW + groupW / 2; }
      function yFor(v) { return padT + plotH - ((v - minVal) / (maxVal - minVal)) * plotH; }

      [0, 25, 50, 75, 100].forEach(function (v) {
        var y = yFor(v);
        svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: border, "stroke-width": 1 }));
        var lbl = el("text", { x: padL - 8, y: y + 4, "text-anchor": "end", "font-size": 10.5, fill: inkMuted, "font-variant-numeric": "tabular-nums" });
        lbl.textContent = v + "%";
        svg.appendChild(lbl);
      });
      data.labels.forEach(function (label, i) {
        var lbl = el("text", { x: xFor(i), y: H - 7, "text-anchor": "middle", "font-size": 10.5, fill: inkMuted });
        lbl.textContent = label;
        svg.appendChild(lbl);
      });

      var actSwatch = document.getElementById("trendYieldActualSwatch");
      if (actSwatch) actSwatch.style.background = success;
      var lySwatch = document.getElementById("trendYieldLastYearSwatch");
      if (lySwatch) lySwatch.style.background = inkMuted;

      var tip = document.getElementById("trendYieldTip");
      var hitGroup = el("g", {});
      data.labels.forEach(function (label, i) {
        var cx = xFor(i);
        var xLY = cx - 2 - barW;
        var xAct = cx + 2;

        var lyVal = data.lastYearYieldPct[i] || 0;
        var actVal = data.yieldPct[i] || 0;
        var lyRect = el("rect", { x: xLY, y: yFor(lyVal), width: barW, height: plotH - (yFor(lyVal) - padT), rx: 3, fill: inkMuted, opacity: 0.55 });
        var actRect = el("rect", { x: xAct, y: yFor(actVal), width: barW, height: plotH - (yFor(actVal) - padT), rx: 3, fill: success });
        svg.appendChild(lyRect);
        svg.appendChild(actRect);

        var hit = el("rect", { x: cx - groupW / 2, y: padT, width: groupW, height: plotH, fill: "transparent" });
        hit.style.cursor = "pointer";
        hit.addEventListener("mouseenter", function () {
          actRect.setAttribute("opacity", 0.82); lyRect.setAttribute("opacity", 0.82);
          var rect = svg.getBoundingClientRect(); var scale = rect.width / W;
          tip.style.left = (cx * scale) + "px";
          tip.style.top = (yFor(Math.max(actVal, lyVal)) * scale) + "px";
          var hasBoth = data.yieldPct[i] != null && data.lastYearYieldPct[i] != null;
          var diff = hasBoth ? Math.round((data.yieldPct[i] - data.lastYearYieldPct[i]) * 10) / 10 : null;
          tip.innerHTML = '<div class="t-title">' + label + '</div>' +
            '<div class="t-row"><span class="t-dot" style="background:' + success + '"></span>This Year &nbsp;' + (data.yieldPct[i] == null ? 'n/a' : data.yieldPct[i] + '%') + '</div>' +
            '<div class="t-row"><span class="t-dot" style="background:' + inkMuted + '; opacity:.55;"></span>Last Year &nbsp;' + (data.lastYearYieldPct[i] == null ? 'n/a' : data.lastYearYieldPct[i] + '%') + '</div>' +
            (diff === null ? '' : '<div style="margin-top:3px; color:' + (diff >= 0 ? cssVar('--success') : cssVar('--critical')) + '">' + (diff >= 0 ? "+" : "") + diff + ' pts vs last year</div>');
          tip.classList.add("visible");
        });
        hit.addEventListener("mouseleave", function () { actRect.setAttribute("opacity", 1); lyRect.setAttribute("opacity", 0.55); tip.classList.remove("visible"); });
        hitGroup.appendChild(hit);
      });
      svg.appendChild(hitGroup);
    }

    function render() {
      var cfg = PLANTS[state.plant];
      var data = genSeries(state.plant, state.period);
      drawProdChart(data);
      drawYieldChart(data);
      if (yieldNote) yieldNote.textContent = PERIODS[state.period].note;
      tabs.forEach(function (tab) {
        var active = tab.dataset.period === state.period;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
    }

    function openModal(plantKey) {
      var cfg = PLANTS[plantKey];
      if (!cfg) return;
      state.plant = plantKey;
      state.period = "weekly";
      codeEl.textContent = cfg.code;
      fullEl.textContent = cfg.full;
      header.classList.remove("tier-blue", "tier-green", "tier-orange");
      header.classList.add(cfg.tier);
      modal.classList.remove("tier-blue", "tier-green", "tier-orange");
      modal.classList.add(cfg.tier);
      render();
      overlay.hidden = false;
      document.body.style.overflow = "hidden";
    }
    function closeModal() {
      overlay.hidden = true;
      document.body.style.overflow = "";
    }

    document.querySelectorAll(".pp-trend-icon-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { openModal(btn.dataset.plant); });
    });
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.period = tab.dataset.period;
        render();
      });
    });
    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", function (ev) { if (ev.target === overlay) closeModal(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !overlay.hidden) closeModal();
    });
    window.addEventListener("resize", function () {
      if (!overlay.hidden) {
        clearTimeout(window.__zbTrendT);
        window.__zbTrendT = setTimeout(render, 120);
      }
    });
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        if (!overlay.hidden) render();
      });
    }
  })();
})();
