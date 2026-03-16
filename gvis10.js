looker.plugins.visualizations.add({
  id: "advanced_looker_table",
  label: "Advanced Looker Table",
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
        
        /* =======================================================
           PRINTING LOGIC FOR SCHEDULED EMAILS (ANTI-CROPPING)
           ======================================================= */
        .is-printing .table-scroll {
          overflow: visible !important;
          height: auto !important;
          width: 100% !important;
        }
        
        .is-printing thead th, 
        .is-printing td:first-child, 
        .is-printing th:first-child, 
        .is-printing tfoot td {
          position: static !important; 
        }

        /* Force table to squeeze into Looker's fixed email frame */
        .is-printing table {
          table-layout: auto !important;
          font-size: 11px !important; /* Slightly smaller font */
        }
        
        .is-printing th, .is-printing td {
          white-space: normal !important; /* Allow long campaign names to wrap */
          word-wrap: break-word !important;
          padding: 4px !important; /* Shrink empty space to fit more columns */
        }
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

    let dynamicOptions = {
      freeze_first_column: { section: "Plot", type: "boolean", label: "Freeze First Column", default: true },
      freeze_totals: { section: "Plot", type: "boolean", label: "Freeze Totals Row", default: true },
      show_column_totals: { section: "Plot", type: "boolean", label: "Show Master Totals Row", default: true },
      table_theme: { section: "Formatting", type: "string", label: "Table Theme", display: "select", values: [{"Classic": "classic"}], default: "classic" }
    };

    const fieldsToTotal = [].concat(measures, tableCalcs);
    fieldsToTotal.forEach(function(field) {
      dynamicOptions["show_total_" + field.name] = {
        section: "Calculations",
        type: "boolean",
        label: "Total for " + (field.label || field.name),
        default: field.is_table_calculation ? false : true 
      };
    });

    this.trigger('registerOptions', dynamicOptions);

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
      return (typeof cell.value === "number") ? cell.value.toLocaleString() : (cell.value || "");
    }

    function flattenData() {
      let headers = [];
      let rows = [];

      dimensions.forEach(function(d) { headers.push({ type: "dimension", name: d.name, label: d.label }); });

      if (hasPivot) {
        pivots.forEach(function(p) {
          measures.forEach(function(m) { headers.push({ type: "measure", name: m.name, pivot: p.key, label: p.key + " " + m.label }); });
          tableCalcs.forEach(function(c) {
            if (checkIsPivoted(c.name)) { headers.push({ type: "calculation", name: c.name, pivot: p.key, label: p.key + " " + c.label }); }
          });
        });
      } else {
        measures.forEach(function(m) { headers.push({ type: "measure", name: m.name, label: m.label }); });
      }

      tableCalcs.forEach(function(c) {
        if (!checkIsPivoted(c.name)) { headers.push({ type: "calculation", name: c.name, label: c.label }); }
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

      let html = "<table><thead><tr>";
      headers.forEach(function(h, i) {
        let cls = h.type === "dimension" ? "dim-header" : (h.type === "calculation" ? "calc-header" : "measure-header");
        html += '<th class="' + cls + '" data-index="' + i + '">' + h.label + '<div class="resize-handle"></div></th>';
      });
      html += "</tr></thead><tbody>";

      rows.forEach(function(row, r) {
        html += "<tr>";
        row.forEach(function(c, i) {
          const isDim = c.header.type === "dimension";
          const isCalc = c.header.type === "calculation";
          
          let val = 0;
          if (c.cell && c.cell.value !== undefined && c.cell.value !== null) {
            val = c.cell.value;
          }

          let isTotalEnabled = config["show_total_" + c.header.name];
          if (isTotalEnabled === undefined) isTotalEnabled = !isCalc;

          if (config.show_column_totals && isTotalEnabled && !isDim) {
            columnTotals[i] += (typeof val === 'number' ? val : 0);
          }

          let cellClass = isDim ? 'dim-cell' : (isCalc ? 'calc-cell numeric' : 'measure-cell numeric');
          html += '<td class="' + cellClass + ' cell-drill" data-row="' + r + '" data-col="' + i + '">' + formatValue(c.cell) + '</td>';
        });
        html += "</tr>";
      });

      html += "</tbody>";

      if (config.show_column_totals) {
        html += "<tfoot><tr>";
        headers.forEach(function(h, i) {
          let style = h.type === "dimension" ? "dim-cell" : "";
          if (h.type === "dimension") {
            html += '<td class="total-cell ' + style + '">' + (i === 0 ? "Total" : "") + '</td>';
          } else {
            let isTotalEnabled = config["show_total_" + h.name];
            if (isTotalEnabled === undefined) isTotalEnabled = h.type === "measure";

            if (isTotalEnabled) {
              let totalVal = columnTotals[i];
              html += '<td class="numeric total-cell">' + (totalVal !== 0 ? totalVal.toLocaleString() : "0") + '</td>';
            } else {
              html += '<td class="numeric total-cell"></td>';
            }
          }
        });
        html += "</tr></tfoot></table>";
      }

      element.querySelector("#table_container").innerHTML = html;

      // APPLY PRINTING CLASS
      if (details && details.print) {
        element.classList.add("is-printing");
      } else {
        element.classList.remove("is-printing");
      }

      element.querySelectorAll("th[data-index]").forEach(function(header) {
        header.onclick = function() {
          const idx = parseInt(this.dataset.index);
          sortDirection = (sortColumn === idx) ? sortDirection * -1 : 1;
          sortColumn = idx;
          rows.sort(function(a, b) {
            let vA = -Infinity;
            let vB = -Infinity;
            if (a[idx] && a[idx].cell !== undefined && a[idx].cell !== null) { vA = a[idx].cell.value; }
            if (b[idx] && b[idx].cell !== undefined && b[idx].cell !== null) { vB = b[idx].cell.value; }
            return (vA < vB ? -1 : vA > vB ? 1 : 0) * sortDirection;
          });
          render();
        };
      });

      element.querySelectorAll(".cell-drill").forEach(function(cell) {
        cell.onclick = function(e) {
          const r = this.dataset.row;
          const c = this.dataset.col;
          const cellData = rows[r][c].cell;
          if (cellData && cellData.links) { LookerCharts.Utils.openDrillMenu({ links: cellData.links, event: e }); }
        };
      });
    }

    render();
    
    setTimeout(function() {
      done();
    }, 100);
  }
});
