looker.plugins.visualizations.add({
  id: "advanced_looker_table",
  label: "Advanced Looker Table",
  
  // We leave the base options empty because we will generate them dynamically below
  options: {},

  create: function(element) {
    element.innerHTML = `
      <style>
        .table-scroll { width: 100%; height: 100%; overflow: auto; }
        table { border-collapse: collapse; width: 100%; font-family: Arial; font-size: 13px; }
        th, td { padding: 8px; border-bottom: 1px solid #e5e5e5; white-space: nowrap; }
        th { cursor: pointer; position: relative; }
        
        /* SHADES */
        .dim-header { background: #dceaf8 !important; font-weight: bold; border-right: 1px solid #c5dcf1; }
        .dim-cell { background: #f4f8fc !important; border-right: 1px solid #e2eef9; }
        .measure-header { background: #ede7e0 !important; }
        .measure-cell { background: #ffffff !important; }
        .calc-header { background: #dff0d8 !important; border-bottom: 2px solid #bcdfb3; }
        .calc-cell { background: #f2f9f2 !important; }

        .numeric { text-align: right; }
        .total-cell { background: #e8e8e8; font-weight: bold; }
        
        .resize-handle { position: absolute; right: 0; top: 0; width: 5px; height: 100%; cursor: col-resize; }
        
        /* STICKY BEHAVIOR */
        thead th { position: sticky; top: 0; z-index: 5; }
        td:first-child, th:first-child { position: sticky; left: 0; z-index: 4; }
        thead th:first-child { z-index: 6; }
        tfoot td { position: sticky; bottom: 0; z-index: 3; background: #e8e8e8; }
        
      </style>
      <div class="table-scroll"><div id="table_container"></div></div>
    `;
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    const dimensions = queryResponse.fields.dimension_like || [];
    const allMeasuresLike = queryResponse.fields.measure_like || [];
    const tableCalcs = queryResponse.fields.table_calculations || [];
    
    const calcNames = tableCalcs.map(c => c.name);
    const measures = allMeasuresLike.filter(m => !calcNames.includes(m.name));

    const pivots = queryResponse.pivots || [];
    const hasPivot = pivots.length > 0;

    // ==========================================================
    // NEW LOGIC: DYNAMIC EDIT PANE OPTIONS
    // ==========================================================
    let dynamicOptions = {
      // 1. PLOT TAB
      freeze_first_column: { section: "Plot", type: "boolean", label: "Freeze First Column", default: true },
      freeze_totals: { section: "Plot", type: "boolean", label: "Freeze Totals Row", default: true },
      show_column_totals: { section: "Plot", type: "boolean", label: "Show Master Totals Row", default: true },
      
      // 3. FORMATTING TAB (Added a dummy feature to make the tab appear)
      table_theme: { section: "Formatting", type: "string", label: "Table Theme", display: "select", values: [{"Classic": "classic"}], default: "classic" }
    };

    // 2. CALCULATIONS TAB
    // Loop through all measures and calcs to create a total toggle for each
    const fieldsToTotal = [...measures, ...tableCalcs];
    fieldsToTotal.forEach(field => {
      dynamicOptions[`show_total_${field.name}`] = {
        section: "Calculations",
        type: "boolean",
        label: `Total for ${field.label || field.name}`,
        // Default measures to ON, and table calcs to OFF (since summing calcs often breaks math)
        default: field.is_table_calculation ? false : true 
      };
    });

    // Register the new tabs with Looker
    this.trigger('registerOptions', dynamicOptions);

    // ==========================================================
    // DATA FLATTENING LOGIC (Unchanged)
    // ==========================================================
    let sortColumn = null;
    let sortDirection = 1;

    function checkIsPivoted(fieldName) {
      if (!hasPivot || !data || data.length === 0) return false;
      const pivotKey = pivots[0].key;
      for (let i = 0; i < Math.min(data.length, 5); i++) {
        if (data[i][fieldName] && data[i][fieldName][pivotKey] !== undefined) {
          return true; 
        }
      }
      return false; 
    }

    function formatValue(cell) {
      if (!cell) return "";
      if (cell.rendered !== undefined) return cell.rendered;
      return (typeof cell.value === "number") ? cell.value.toLocaleString() : (cell.value ?? "");
    }

    function flattenData() {
      let headers = [];
      let rows = [];

      dimensions.forEach(d => { headers.push({ type: "dimension", name: d.name, label: d.label }); });

      if (hasPivot) {
        pivots.forEach(p => {
          measures.forEach(m => { headers.push({ type: "measure", name: m.name, pivot: p.key, label: p.key + " " + m.label }); });
          tableCalcs.forEach(c => {
            if (checkIsPivoted(c.name)) { headers.push({ type: "calculation", name: c.name, pivot: p.key, label: p.key + " " + c.label }); }
          });
        });
      } else {
        measures.forEach(m => { headers.push({ type: "measure", name: m.name, label: m.label }); });
      }

      tableCalcs.forEach(c => {
        if (!checkIsPivoted(c.name)) { headers.push({ type: "calculation", name: c.name, label: c.label }); }
      });

      data.forEach((row, rIdx) => {
        let flatRow = [];
        headers.forEach(h => {
          let cellData = row[h.name];
          if (h.pivot && cellData) { cellData = cellData[h.pivot]; }
          flatRow.push({ cell: cellData, header: h });
        });
        rows.push(flatRow);
      });

      return { headers, rows };
    }

    // ==========================================================
    // RENDER LOGIC (Updated to check dynamic config toggles)
    // ==========================================================
    function render() {
      const { headers, rows } = flattenData();
      let columnTotals = new Array(headers.length).fill(0);

      let html = "<table><thead><tr>";
      headers.forEach((h, i) => {
        let cls = h.type === "dimension" ? "dim-header" : (h.type === "calculation" ? "calc-header" : "measure-header");
        html += `<th class="${cls}" data-index="${i}">${h.label}<div class="resize-handle"></div></th>`;
      });
      html += "</tr></thead><tbody>";

      rows.forEach((row, r) => {
        html += "<tr>";
        row.forEach((c, i) => {
          const isDim = c.header.type === "dimension";
          const isCalc = c.header.type === "calculation";
          let val = c.cell?.value ?? 0;

          // Check if this specific column is toggled ON in the Calculations Tab
          let isTotalEnabled = config[`show_total_${c.header.name}`];
          if (isTotalEnabled === undefined) isTotalEnabled = !isCalc; // Fallback to defaults

          if (config.show_column_totals && isTotalEnabled && !isDim) {
            columnTotals[i] += (typeof val === 'number' ? val : 0);
          }

          let cellClass = isDim ? 'dim-cell' : (isCalc ? 'calc-cell numeric' : 'measure-cell numeric');
          html += `<td class="${cellClass} cell-drill" data-row="${r}" data-col="${i}">${formatValue(c.cell)}</td>`;
        });
        html += "</tr>";
      });

      html += "</tbody>";

      // FOOTER RENDERING
      if (config.show_column_totals) {
        html += "<tfoot><tr>";
        headers.forEach((h, i) => {
          let style = h.type === "dimension" ? "dim-cell" : "";
          if (h.type === "dimension") {
            html += `<td class="total-cell ${style}">${i === 0 ? "Total" : ""}</td>`;
          } else {
            // Check if this specific column is toggled ON
            let isTotalEnabled = config[`show_total_${h.name}`];
            if (isTotalEnabled === undefined) isTotalEnabled = h.type === "measure";

            if (isTotalEnabled) {
              let totalVal = columnTotals[i];
              html += `<td class="numeric total-cell">${totalVal !== 0 ? totalVal.toLocaleString() : "0"}</td>`;
            } else {
              // Leave cell empty if user toggled the total OFF
              html += `<td class="numeric total-cell"></td>`;
            }
          }
        });
        html += "</tr></tfoot></table>";
      }

      element.querySelector("#table_container").innerHTML = html;

      // APPLY INTERACTIVITY
      element.querySelectorAll("th[data-index]").forEach(header => {
        header.onclick = function() {
          const idx = parseInt(this.dataset.index);
          sortDirection = (sortColumn === idx) ? sortDirection * -1 : 1;
          sortColumn = idx;
          rows.sort((a, b) => {
            let vA = a[idx].cell?.value, vB = b[idx].cell?.value;
            if (vA === null || vA === undefined) vA = -Infinity; 
            if (vB === null || vB === undefined) vB = -Infinity;
            return (vA < vB ? -1 : vA > vB ? 1 : 0) * sortDirection;
          });
          render();
        };
      });

      element.querySelectorAll(".cell-drill").forEach(cell => {
        cell.onclick = function(e) {
          const r = this.dataset.row, c = this.dataset.col;
          const cellData = rows[r][c].cell;
          if (cellData && cellData.links) { LookerCharts.Utils.openDrillMenu({ links: cellData.links, event: e }); }
        };
      });
    }

    render();
    done();
  }
});
