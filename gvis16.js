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
          white-space: normal; 
          word-wrap: break-word; 
        }
        th { cursor: pointer; position: relative; text-align: left; vertical-align: bottom; }
        
        /* TEXTURES & WEIGHTS */
        .view-name { font-size: 11px; color: #939ba5; font-weight: 400; display: block; margin-bottom: 2px; }
        .field-name { font-size: 12px; color: #262d33; font-weight: 600; display: block; }
        
        .truncate-text .view-name, .truncate-text .field-name, .truncate-text td {
          white-space: nowrap !important; overflow: hidden; text-overflow: ellipsis; max-width: 150px;
        }

        /* SHADES */
        .dim-header { background: #dceaf8 !important; border-right: 1px solid #c5dcf1; }
        .dim-cell { background: #f4f8fc !important; border-right: 1px solid #e2eef9; }
        .measure-header { background: #ede7e0 !important; }
        .measure-cell { background: #ffffff !important; }
        .calc-header { background: #dff0d8 !important; border-bottom: 2px solid #bcdfb3; }
        .calc-cell { background: #f2f9f2 !important; }

        .numeric { text-align: right; }
        .total-cell { background: #e8e8e8; font-weight: bold; }
        .row-num { background: #f8f9fa; color: #939ba5; width: 30px; text-align: center; border-right: 1px solid #dee2e6; }
        
        .resize-handle { position: absolute; right: 0; top: 0; width: 4px; height: 100%; cursor: col-resize; }
        
        thead th { position: sticky; top: 0; z-index: 5; }
        td:first-child, th:first-child { position: sticky; left: 0; z-index: 4; }
        thead th:first-child { z-index: 6; }
        tfoot td { position: sticky; bottom: 0; z-index: 3; background: #e8e8e8; }
        
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

    // Invisible spaces force perfect tab order
    const TAB_PLOT = "\u200BPlot";             
    const TAB_SERIES = "\u200B\u200BSeries";     
    const TAB_FORMAT = "\u200B\u200B\u200BFormatting"; 

    let dynamicOptions = {};

    dynamicOptions.show_row_numbers = { section: TAB_PLOT, type: "boolean", label: "Show Row Numbers", default: false, order: 1 };
    dynamicOptions.show_column_totals = { section: TAB_PLOT, type: "boolean", label: "Show Column Totals", default: false, order: 2 };

    if (config.show_column_totals) {
      dynamicOptions.totals_warning = {
        section: TAB_PLOT, type: "string", display: "divider", label: "⚠️ Warning: Sum may be inaccurate for percentages and ratios.", order: 3
      };
      fieldsToTotal.forEach(function(field, idx) {
        dynamicOptions["show_total_" + field.name] = {
          section: TAB_PLOT, type: "boolean", label: "Total for " + (field.label_short || field.label || field.name), default: false, order: 4 + idx
        };
      });
    }

    dynamicOptions.truncate_column_names = { section: TAB_SERIES, type: "boolean", label: "Truncate Column Names", default: false, order: 100 };
    dynamicOptions.show_full_field_name = { section: TAB_SERIES, type: "boolean", label: "Show Full Field Name", default: false, order: 101 };
    dynamicOptions.customization_divider = { section: TAB_SERIES, type: "string", display: "divider", label: "CUSTOMIZATIONS", order: 102 };
    
    allFields.forEach(function(field, idx) {
      dynamicOptions["custom_label_" + field.name] = {
        section: TAB_SERIES, type: "string", label: field.label_short || field.label || field.name, default: "", order: 103 + idx
      };
    });

    dynamicOptions.enable_cond_format = { section: TAB_FORMAT, type: "boolean", label: "Enable Conditional Formatting", default: false, order: 200 };
    dynamicOptions.include_totals = { section: TAB_FORMAT, type: "boolean", label: "Include Totals", default: false, order: 201 };
    dynamicOptions.include_nulls = { section: TAB_FORMAT, type: "boolean", label: "Include Null Values as Zero", default: true, order: 202 };

    this.trigger('registerOptions', dynamicOptions);

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

    function isRateOrPercent(field) {
      if (!field) return false;
      var format = (field.value_format || "").toLowerCase();
      var type = (field.type || "").toLowerCase();
      var name = (field.name || "").toLowerCase();
      var label = (field.label || "").toLowerCase();
      if (format.indexOf("%") !== -1 || type.indexOf("percent") !== -1 || type.indexOf("average") !== -1) return true;
      if (name.match(/cpc|cpm|cpa|cpl|ratio|rate|percent|margin/) || label.match(/cpc|cpm|cpa|cpl|ratio|rate|percent|margin/)) return true;
      return false;
    }

    function formatValue(cell, field) {
      if (!cell || cell.value === null || cell.value === undefined || cell.value === "") {
        return config.include_nulls ? "0" : "";
      }
      if (typeof cell.value === "number") {
        if (isRateOrPercent(field)) {
          return cell.rendered !== undefined ? cell.rendered : cell.value.toLocaleString();
        } else {
          return cell.value.toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
        }
      }
      return cell.rendered !== undefined ? cell.rendered : (cell.value || "");
    }

    function flattenData() {
      let headers = [];
      let rows = [];

      dimensions.forEach(function(d) { headers.push({ type: "dimension", name: d.name, label: d.label, field: d }); });

      if (hasPivot) {
        pivots.forEach(function(p) {
          measures.forEach(function(m) { headers.push({ type: "measure", name: m.name, pivot: p.key, label: m.label, field: m }); });
          tableCalcs.forEach(function(c) {
            if (checkIsPivoted(c.name)) { headers.push({ type: "calculation", name: c.name, pivot: p.key, label: c.label, field: c }); }
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
      
      if (config.show_row_numbers) html += '<th class="dim-header row-num">#</th>';

      headers.forEach(function(h, i) {
        let cls = h.type === "dimension" ? "dim-header" : (h.type === "calculation" ? "calc-header" : "measure-header");
        
        let fieldKey = h.field ? h.field.name : h.name;
        let customLabel = config["custom_label_" + fieldKey];
        
        let viewName = (h.field && h.field.view_label) ? h.field.view_label : "";
        
        let fieldName = h.label;
        if (h.field) {
          fieldName = h.field.label_short || h.field.label || h.field.name;
        }

        if (customLabel && customLabel.trim() !== "") {
          fieldName = customLabel;
        }

        // --- SAFE OBJECT-RESILIENT PIVOT HEADER LOGIC ---
        if (h.pivot) {
          var pivotObj = pivots.filter(function(p) { return p.key === h.pivot; })[0];
          var pivotLabel = h.pivot;
          
          if (pivotObj && pivotObj.labels) {
            // Check if it's an array we can safely join directly
            if (typeof pivotObj.labels.join === 'function') {
              pivotLabel = pivotObj.labels.join(' - ');
            } else {
              // If it's a structural key-value metadata object, extract values manually
              var labelsArray = [];
              for (var key in pivotObj.labels) {
                if (pivotObj.labels.hasOwnProperty(key)) {
                  labelsArray.push(pivotObj.labels[key]);
                }
              }
              if (labelsArray.length > 0) {
                pivotLabel = labelsArray.join(' - ');
              }
            }
          }
          fieldName = pivotLabel + " - " + fieldName;
        }

        let headerText = "";
        if (config.show_full_field_name && viewName !== "") {
          headerText = '<span class="field-name">' + viewName + ' ' + fieldName + '</span>';
        } else if (viewName !== "") {
          headerText = '<span class="view-name">' + viewName + '</span><span class="field-name">' + fieldName + '</span>';
        } else {
          headerText = '<span class="field-name">' + fieldName + '</span>';
        }

        html += '<th class="' + cls + '" data-index="' + i + '">' + headerText + '<div class="resize-handle"></div></th>';
      });
      html += "</tr></thead><tbody>";

      rows.forEach(function(row, r) {
        html += "<tr>";
        if (config.show_row_numbers) html += '<td class="row-num">' + (r + 1) + '</td>';

        row.forEach(function(c, i) {
          const isDim = c.header.type === "dimension";
          const isCalc = c.header.type === "calculation";
          
          let val = 0;
          if (c.cell && c.cell.value !== undefined && c.cell.value !== null) { val = c.cell.value; }

          let isTotalEnabled = config["show_total_" + c.header.name];
          if (config.show_column_totals && isTotalEnabled && !isDim && !isRateOrPercent(c.header.field)) {
            columnTotals[i] += (typeof val === 'number' ? val : 0);
          }

          let cellClass = isDim ? 'dim-cell' : (isCalc ? 'calc-cell numeric' : 'measure-cell numeric');
          html += '<td class="' + cellClass + ' cell-drill" data-row="' + r + '" data-col="' + i + '">' + formatValue(c.cell, c.header.field) + '</td>';
        });
        html += "</tr>";
      });

      html += "</tbody>";

      if (config.show_column_totals) {
        html += "<tfoot><tr>";
        if (config.show_row_numbers) html += '<td class="total-cell row-num"></td>';

        headers.forEach(function(h, i) {
          let style = h.type === "dimension" ? "dim-cell" : "";
          if (h.type === "dimension") {
            html += '<td class="total-cell ' + style + '">' + (i === 0 ? "Total" : "") + '</td>';
          } else {
            let isTotalEnabled = config["show_total_" + h.name];
            let safeToSum = !isRateOrPercent(h.field);
            
            if (isTotalEnabled && safeToSum) {
              let totalVal = columnTotals[i];
              html += '<td class="numeric total-cell">' + (totalVal !== 0 ? Math.round(totalVal).toLocaleString() : "0") + '</td>';
            } else {
              html += '<td class="numeric total-cell"></td>';
            }
          }
        });
        html += "</tr></tfoot>";
      }
      html += "</table>";

      element.querySelector("#table_container").innerHTML = html;

      if (details && details.print) { element.classList.add("is-printing"); } 
      else { element.classList.remove("is-printing"); }

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
