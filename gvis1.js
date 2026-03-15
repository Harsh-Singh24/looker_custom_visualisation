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
        th, td { padding: 8px; border-bottom: 1px solid #e5e5e5; white-space: nowrap; background: #fff; }
        th { cursor: pointer; position: relative; }
        .dim-header { background: #f9f9f9; font-weight: bold; }
        .measure-header { background: #ede7e0; }
        .calc-header { background: #dff0d8 !important; } /* Greenish shade for calculations */
        .numeric { text-align: right; }
        .total-cell { background: #dff0d8; font-weight: bold; }
        .calc-cell { background: #f2f9f2; } /* Lighter green for calc data cells */
        .resize-handle { position: absolute; right: 0; top: 0; width: 5px; height: 100%; cursor: col-resize; }
        thead th { position: sticky; top: 0; z-index: 5; }
        td:first-child, th:first-child { position: sticky; left: 0; z-index: 4; background: #fff; }
        thead th:first-child { z-index: 6; }
        tfoot td { position: sticky; bottom: 0; z-index: 3; background: #dff0d8; }
        tbody tr:nth-child(even) { background: #fcfcfc; }
        tbody tr:hover { background: #efefef; }
      </style>
      <div class="table-scroll"><div id="table_container"></div></div>
    `;
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    const dimensions = queryResponse.fields.dimension_like;
    const measures = queryResponse.fields.measure_like;
    const tableCalcs = queryResponse.fields.table_calculations || [];
    const pivots = queryResponse.pivots || [];
    const hasPivot = pivots.length > 0;

    let sortColumn = null;
    let sortDirection = 1;

    function formatValue(cell) {
      if (!cell) return "";
      if (cell.rendered !== undefined) return cell.rendered;
      let v = cell.value;
      return (typeof v === "number") ? v.toLocaleString() : (v ?? "");
    }

    function drill(cell, event) {
      if (cell && cell.links) {
        LookerCharts.Utils.openDrillMenu({ links: cell.links, event: event });
      }
    }

    function flattenData() {
      let headers = [];
      let rows = [];

      // 1. DIMENSIONS
      dimensions.forEach(d => {
        headers.push({ type: "dimension", name: d.name, label: d.label });
      });

      // 2. PIVOTED MEASURES & CALCS (e.g., "test")
      if (hasPivot) {
        pivots.forEach(p => {
          measures.forEach(m => {
            headers.push({ type: "measure", name: m.name, pivot: p.key, label: p.key + " " + m.label, field: m });
          });
          tableCalcs.forEach(c => {
            if (c.is_pivoted) {
              headers.push({ type: "calculation", name: c.name, pivot: p.key, label: p.key + " " + c.label, field: c });
            }
          });
        });
      } else {
        measures.forEach(m => {
          headers.push({ type: "measure", name: m.name, label: m.label, field: m });
        });
      }

      // 3. NON-PIVOTED CALCS (e.g., "test 2" - Row Totals)
      tableCalcs.forEach(c => {
        if (!c.is_pivoted || !hasPivot) {
          headers.push({ type: "calculation", name: c.name, label: c.label, field: c });
        }
      });

      // BUILD ROWS
      data.forEach(row => {
        let flatRow = [];
        headers.forEach(h => {
          let cellData = row[h.name];
          if (h.pivot && cellData && cellData[h.pivot]) {
            cellData = cellData[h.pivot];
          }
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
      headers.forEach((h, i) => {
        let cls = h.type === "dimension" ? "dim-header" : (h.type === "calculation" ? "calc-header" : "measure-header");
        html += `<th class="${cls}" data-index="${i}">${h.label}<div class="resize-handle"></div></th>`;
      });
      html += "</tr></thead><tbody>";

      rows.forEach((row, r) => {
        html += "<tr>";
        row.forEach((c, i) => {
          const isNumeric = c.header.type !== "dimension";
          const isCalc = c.header.type === "calculation";
          let val = c.cell?.value ?? 0;

          if (config.show_column_totals && isNumeric && !c.header.field?.is_table_calculation) {
            columnTotals[i] += (typeof val === 'number' ? val : 0);
          }

          html += `<td class="${isNumeric ? 'numeric' : ''} ${isCalc ? 'calc-cell' : ''} cell-drill" data-row="${r}" data-col="${i}">
                    ${formatValue(c.cell)}</td>`;
        });
        html += "</tr>";
      });

      html += "</tbody>";

      if (config.show_column_totals) {
        html += "<tfoot><tr>";
        headers.forEach((h, i) => {
          if (h.type === "dimension") {
            html += `<td class="total-cell">${i === 0 ? "Total" : ""}</td>`;
          } else {
            let totalVal = columnTotals[i];
            // We only show totals for actual measures, not calcs, to avoid math errors
            html += `<td class="numeric total-cell">${(h.type === "measure" && totalVal !== 0) ? totalVal.toLocaleString() : ""}</td>`;
          }
        });
        html += "</tr></tfoot></table>";
      }

      element.querySelector("#table_container").innerHTML = html;

      // Interaction listeners
      element.querySelectorAll("th[data-index]").forEach(header => {
        header.onclick = function() {
          const index = parseInt(this.dataset.index);
          sortDirection = (sortColumn === index) ? sortDirection * -1 : 1;
          sortColumn = index;
          rows.sort((a, b) => {
            let vA = a[index].cell?.value, vB = b[index].cell?.value;
            return (vA < vB ? -1 : vA > vB ? 1 : 0) * sortDirection;
          });
          render();
        };
      });

      element.querySelectorAll(".cell-drill").forEach(cell => {
        cell.onclick = function(e) {
          const r = this.dataset.row, c = this.dataset.col;
          drill(rows[r][c].cell, e);
        };
      });
    }

    render();
    done();
  }
});
