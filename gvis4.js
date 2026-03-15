looker.plugins.visualizations.add({
  id: "advanced_looker_table",
  label: "Advanced Looker Table",
  options: {
    freeze_first_column: { type: "boolean", label: "Freeze First Column", default: true },
    freeze_totals: { type: "boolean", label: "Freeze Totals Row", default: true },
    show_column_totals: { type: "boolean", label: "Show Column Totals", default: true }
  },

  create: function(element) {
    element.innerHTML = `
      <style>
        .table-scroll { width: 100%; height: 100%; overflow: auto; }
        table { border-collapse: collapse; width: 100%; font-family: Arial; font-size: 13px; }
        th, td { padding: 8px; border-bottom: 1px solid #e5e5e5; white-space: nowrap; }
        th { cursor: pointer; position: relative; }
        
        /* 1. BLUE SHADE FOR DIMENSIONS */
        .dim-header { background: #dceaf8 !important; font-weight: bold; border-right: 1px solid #c5dcf1; }
        .dim-cell { background: #f4f8fc !important; border-right: 1px solid #e2eef9; }

        /* 2. BEIGE SHADE FOR MEASURES */
        .measure-header { background: #ede7e0 !important; }
        .measure-cell { background: #ffffff !important; }
        
        /* 3. GREEN SHADE FOR TABLE CALCULATIONS */
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
    
    // --- THE FIX: PREVENT DUPLICATES ---
    // Extract calc names to filter them out of the main measures list
    const calcNames = tableCalcs.map(c => c.name);
    const measures = allMeasuresLike.filter(m => !calcNames.includes(m.name));

    const pivots = queryResponse.pivots || [];
    const hasPivot = pivots.length > 0;

    let sortColumn = null;
    let sortDirection = 1;

    // DATA SNIFFER: Checks if a calculation is inside a pivot
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

      // 1. ADD DIMENSIONS
      dimensions.forEach(d => {
        headers.push({ type: "dimension", name: d.name, label: d.label });
      });

      // 2. ADD PIVOTED COLUMNS
      if (hasPivot) {
        pivots.forEach(p => {
          // Add standard measures (now properly filtered!)
          measures.forEach(m => {
            headers.push({ type: "measure", name: m.name, pivot: p.key, label: p.key + " " + m.label });
          });
          // Add PIVOTED calculations
          tableCalcs.forEach(c => {
            if (checkIsPivoted(c.name)) {
              headers.push({ type: "calculation", name: c.name, pivot: p.key, label: p.key + " " + c.label });
            }
          });
        });
      } else {
        // Normal table without pivots
        measures.forEach(m => {
          headers.push({ type: "measure", name: m.name, label: m.label });
        });
      }

      // 3. ADD NON-PIVOTED COLUMNS (e.g. Row Totals, or all calcs in a normal table)
      tableCalcs.forEach(c => {
        if (!checkIsPivoted(c.name)) {
          headers.push({ type: "calculation", name: c.name, label: c.label });
        }
      });

      // BUILD ROWS
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

    function render() {
      const { headers, rows } = flattenData();
      let columnTotals = new Array(headers.length).fill(0);

      let html = "<table><thead><tr>";
      
      // RENDER HEADERS
      headers.forEach((h, i) => {
        let cls = h.type === "dimension" ? "dim-header" : (h.type === "calculation" ? "calc-header" : "measure-header");
        html += `<th class="${cls}" data-index="${i}">${h.label}<div class="resize-handle"></div></th>`;
      });
      html += "</tr></thead><tbody>";

      // RENDER ROWS
      rows.forEach((row, r) => {
        html += "<tr>";
        row.forEach((c, i) => {
          const isDim = c.header.type === "dimension";
          const isCalc = c.header.type === "calculation";
          let val = c.cell?.value ?? 0;

          if (config.show_column_totals && c.header.type === "measure") {
            columnTotals[i] += (typeof val === 'number' ? val : 0);
          }

          let cellClass = isDim ? 'dim-cell' : (isCalc ? 'calc-cell numeric' : 'measure-cell numeric');
          html += `<td class="${cellClass} cell-drill" data-row="${r}" data-col="${i}">${formatValue(c.cell)}</td>`;
        });
        html += "</tr>";
      });

      html += "</tbody>";

      // RENDER FOOTER (TOTALS)
      if (config.show_column_totals) {
        html += "<tfoot><tr>";
        headers.forEach((h, i) => {
          let style = h.type === "dimension" ? "dim-cell" : "";
          if (h.type === "dimension") {
            html += `<td class="total-cell ${style}">${i === 0 ? "Total" : ""}</td>`;
          } else {
            let totalVal = columnTotals[i];
            html += `<td class="numeric total-cell">${(h.type === "measure" && totalVal !== 0) ? totalVal.toLocaleString() : ""}</td>`;
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
          if (cellData && cellData.links) {
            LookerCharts.Utils.openDrillMenu({ links: cellData.links, event: e });
          }
        };
      });
    }

    render();
    done();
  }
});
