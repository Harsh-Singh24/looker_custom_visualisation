looker.plugins.visualizations.add({
  id: "advanced_looker_table",
  label: "Advanced Looker Table",
  options: {}, 

  create: function(element) {
    element.innerHTML = `
      <style>
        .table-scroll { width: 100%; height: 100%; overflow: auto; }
        table { border-collapse: collapse; width: 100%; table-layout: auto; font-family: 'Open Sans', Arial, sans-serif; font-size: 13px; }
        
        /* WRAPPING AND SPACING */
        th, td { 
          padding: 8px 12px; 
          border-bottom: 1px solid #dee2e6; 
          white-space: normal; /* Enables wrapping */
          word-wrap: break-word; 
        }
        th { cursor: pointer; position: relative; text-align: left; vertical-align: bottom; }
        
        /* LOOKER NATIVE HEADER TEXTURES */
        .view-name { font-size: 11px; color: #939ba5; font-weight: 400; display: block; margin-bottom: 2px; }
        .field-name { font-size: 12px; color: #262d33; font-weight: 600; display: block; }
        
        /* TRUNCATION TOGGLE CLASS */
        .truncate-text .view-name, .truncate-text .field-name, .truncate-text td {
          white-space: nowrap !important;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 150px;
        }

        /* SHADES */
        .dim-header { background: #f8f9fa !important; border-right: 1px solid #dee2e6; }
        .dim-cell { background: #ffffff !important; border-right: 1px solid #dee2e6; }
        .measure-header { background: #ffffff !important; }
        .measure-cell { background: #ffffff !important; }
        .calc-header { background: #f4f8fa !important; border-top: 3px solid #6c43e0; }
        .calc-cell { background: #fafbfc !important; }

        .numeric { text-align: right; }
        .total-cell { background: #f1f3f5; font-weight: bold; }
        .row-num { background: #f8f9fa; color: #939ba5; width: 30px; text-align: center; border-right: 1px solid #dee2e6; }
        
        .resize-handle { position: absolute; right: 0; top: 0; width: 4px; height: 100%; cursor: col-resize; }
        
        /* STICKY BEHAVIOR (Now default, removed from options) */
        thead th { position: sticky; top: 0; z-index: 5; }
        td:first-child, th:first-child { position: sticky; left: 0; z-index: 4; }
        thead th:first-child { z-index: 6; }
        tfoot td { position: sticky; bottom: 0; z-index: 3; background: #f1f3f5; }
        
        /* PRINTING LOGIC */
        .is-printing .table-scroll { overflow: visible !important; height: auto !important; width: 100% !important; }
        .is-printing thead th, .is-printing td:first-child, .is-printing th:first-child, .is-printing tfoot td { position: static !important; }
        .is-printing table { font-size: 11px !important; }
        .is-printing th, .is-printing td { padding: 4px !important; }
      </style>
      <div class="table-scroll"><div id="table_container"></div></div>
    `;
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    const dimensions = queryResponse.fields.dimension_like || [];
    const allMeasuresLike = queryResponse.fields.measure_like || [];
    const tableCalcs = queryResponse.fields.table_calculations || [];
    
    const calcNames = tableCalcs.map(function(c) { return c.name; });
    const measures = allMeasuresLike.filter(function(m) { return calcNames.indexOf(m.name) === -1; });
    const pivots = queryResponse.pivots || [];
    const hasPivot = pivots.length > 0;
    const fieldsToTotal = [].concat(measures, tableCalcs);
    const allFields = [].concat(dimensions, measures, tableCalcs);

    // ==========================================================
    // DYNAMIC OPTIONS GENERATOR (Creates the Tabs)
    // ==========================================================
    let dynamicOptions = {};

    // --- TAB 1: PLOT ---
    dynamicOptions.show_row_numbers = { section: "Plot", type: "boolean", label: "Show Row Numbers", default: false, order: 1 };
    dynamicOptions.show_column_totals = { section: "Plot", type: "boolean", label: "Show Column Totals", default: false, order: 2 };

    // Conditionally show total options ONLY if main toggle is ON
    if (config.show_column_totals) {
      dynamicOptions.totals_warning = {
        section: "Plot",
        type: "string",
        display: "divider",
        label: "⚠️ Warning: Sum may be inaccurate for percentages and ratios.",
        order: 3
      };
      fieldsToTotal.forEach(function(field, idx) {
        dynamicOptions["show_total_" + field.name] = {
          section: "Plot",
          type: "boolean",
          label: "Total for " + (field.label_short || field.name),
          default: false, // Defaulted to false per your request
          order: 4 + idx
        };
      });
    }

    // --- TAB 2: SERIES ---
    dynamicOptions.truncate_column_names = { section: "Series", type: "boolean", label: "Truncate Column Names", default: false, order: 100 };
    dynamicOptions.show_full_field_name = { section: "Series", type: "boolean", label: "Show Full Field Name", default: false, order: 101 };
    
    dynamicOptions.customization_divider = { section: "Series", type: "string", display: "divider", label: "CUSTOMIZATIONS", order: 102 };
    
    allFields.forEach(function(field, idx) {
      dynamicOptions["custom_label_" + field.name] = {
        section: "Series",
        type: "string",
        label: field.label_short || field.name,
        default: "",
        order: 103 + idx
      };
    });

    // --- TAB 3: FORMATTING ---
    dynamicOptions.enable_cond_format = { section: "Formatting", type: "boolean", label: "Enable Conditional Formatting", default: false, order: 200 };
    dynamicOptions.include_totals = { section: "Formatting", type: "boolean", label: "Include Totals", default: false, order: 201 };
    dynamicOptions.include_nulls = { section: "Formatting", type: "boolean", label: "Include Null Values as Zero", default: true, order: 202 };

    this.trigger('registerOptions', dynamicOptions);

    // ==========================================================
    // DATA FLATTENING & RENDERING
    // ==========================================================
    let sortColumn = null;
    let sortDirection = 1;

    function checkIsPivoted(fieldName) {
      if (!hasPivot || !data || data.length === 0) return false;
      const pivotKey = pivots[0].key;
      for (let i = 0; i < Math.min(data.length, 5); i++) {
        if (data[i][fieldName] && data[i][fieldName][pivotKey] !== undefined) { return true; }
      }
      return false; 
    }

    function formatValue(cell) {
      if (!cell) return "";
      if (cell.rendered !== undefined) return cell.rendered;
      return (typeof cell.value === "number") ? cell.value.toLocaleString() : (cell.value || "");
    }

    function flattenData() {
      let headers = [];
      let rows = [];

      dimensions.forEach(function(d) { headers.push({ type: "dimension", name: d.name, label: d.label, field: d }); });

      if (hasPivot) {
        pivots.forEach(function(p) {
          measures.forEach(function(m) { headers.push({ type: "measure", name: m.name, pivot: p.key, label: p.key + " " + m.label, field: m }); });
          tableCalcs.forEach(function(c) {
            if (checkIsPivoted(c.name)) { headers.push({ type: "calculation", name: c.name, pivot: p.key, label: p.key + " " + c.label, field: c }); }
          });
        });
      } else {
        measures.forEach(function(m) { headers.push({ type: "measure", name: m.name, label: m.label, field: m }); });
      }

      tableCalcs.forEach(function(c) {
        if (!checkIsPivoted(c.name)) { headers.push({ type: "calculation", name: c.name, label: c.label, field: c }); }
      });

      data.forEach(function(row) {
        let flatRow = [];
        headers.forEach(function(h) {
          let cellData = row[h.name];
          if (h.pivot && cellData) { cellData = cellData[h.pivot]; }
          flatRow.push({ cell: cellData, header: h });
        });
        rows.push(flatRow);
      });

      return { headers, rows };
    }

    function render() {
      const flat = flattenData();
      const headers = flat.headers;
      const rows = flat.rows;
      let columnTotals = new Array(headers.length).fill(0);

      let tableClass = config.truncate_column_names ? "truncate-text" : "";
      let html = '<table class="' + tableClass + '"><thead><tr>';
      
      // 1. HEADER ROW NUMBERS
      if (config.show_row_numbers) {
        html += '<th class="dim-header row-num">#</th>';
      }

      // 2. RENDER HEADERS WITH TEXTURES
      headers.forEach(function(h, i) {
        let cls = h.type === "dimension" ? "dim-header" : (h.type === "calculation" ? "calc-header" : "measure-header");
        
        let customLabel = config["custom_label_" + h.header?.field?.name || h.name];
        let headerText = "";

        if (customLabel && customLabel !== "") {
          headerText = '<div class="field-name">' + customLabel + '</div>';
        } else if (config.show_full_field_name) {
          let fullLabel = h.field ? h.field.label : h.label;
          headerText = '<div class="field-name">' + fullLabel + '</div>';
        } else {
          // Native Texture Split
          let viewName = h.field ? (h.field.view_label || "") : "";
          let fieldName = h.field ? (h.field.label_short || h.field.name) : h.label;
          headerText = '<span class="view-name">' + viewName + '</span><span class="field-name">' + fieldName + '</span>';
        }

        html += '<th class="' + cls + '" data-index="' + i + '">' + headerText + '<div class="resize-handle"></div></th>';
      });
      html += "</tr></thead><tbody>";

      // 3. RENDER ROWS
      rows.forEach(function(row, r) {
        html += "<tr>";
        
        if (config.show_row_numbers) {
          html += '<td class="row-num">' + (r + 1) + '</td>';
        }

        row.forEach(function(c, i) {
          const isDim = c.header.type === "dimension";
          const isCalc = c.header.type === "calculation";
          
          let val = 0;
          if (c.cell && c.cell.value !== undefined && c.cell.value !== null) { val = c.cell.value; }

          let isTotalEnabled = config["show_total_" + c.header.name];
          if (config.show_column_totals && isTotalEnabled && !isDim) {
            columnTotals[i] += (typeof val === 'number' ? val : 0);
          }

          let cellClass = isDim ? 'dim-cell' : (isCalc ? 'calc-cell numeric' : 'measure-cell numeric');
          html += '<td class="' + cellClass + ' cell-drill" data-row="' + r + '" data-col="' + i + '">' + formatValue(c.cell) + '</td>';
        });
        html += "</tr>";
      });

      html += "</tbody>";

      // 4. RENDER FOOTER (ONLY IF MAIN TOGGLE IS ON)
      if (config.show_column_totals) {
        html += "<tfoot><tr>";
        
        if (config.show_row_numbers) {
          html += '<td class="total-cell row-num"></td>';
        }

        headers.forEach(function(h, i) {
          let style = h.type === "dimension" ? "dim-cell" : "";
          if (h.type === "dimension") {
            html += '<td class="total-cell ' + style + '">' + (i === 0 ? "Total" : "") + '</td>';
          } else {
            let isTotalEnabled = config["show_total_" + h.name];
            
            if (isTotalEnabled) {
              let totalVal = columnTotals[i];
              html += '<td class="numeric total-cell">' + (totalVal !== 0 ? totalVal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0") + '</td>';
            } else {
              html += '<td class="numeric total-cell"></td>';
            }
          }
        });
        html += "</tr></tfoot>";
      }
      html += "</table>";

      element.querySelector("#table_container").innerHTML = html;

      // APPLY PRINTING CLASS
      if (details && details.print) { element.classList.add("is-printing"); } 
      else { element.classList.remove("is-printing"); }

      // INTERACTIVITY
      element.querySelectorAll("th[data-index]").forEach(function(header) {
        header.onclick = function() {
          const idx = parseInt(this.dataset.index);
          sortDirection = (sortColumn === idx) ? sortDirection * -1 : 1;
          sortColumn = idx;
          rows.sort(function(a, b) {
            let vA = -Infinity, vB = -Infinity;
            if (a[idx] && a[idx].cell !== undefined && a[idx].cell !== null) { vA = a[idx].cell.value; }
            if (b[idx] && b[idx].cell !== undefined && b[idx].cell !== null) { vB = b[idx].cell.value; }
            return (vA < vB ? -1 : vA > vB ? 1 : 0) * sortDirection;
          });
          render();
        };
      });

      element.querySelectorAll(".cell-drill").forEach(function(cell) {
        cell.onclick = function(e) {
          const r = this.dataset.row, c = this.dataset.col;
          const cellData = rows[r][c].cell;
          if (cellData && cellData.links) { LookerCharts.Utils.openDrillMenu({ links: cellData.links, event: e }); }
        };
      });
    }

    render();
    setTimeout(function() { done(); }, 100);
  }
});
