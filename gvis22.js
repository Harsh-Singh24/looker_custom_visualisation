looker.plugins.visualizations.add({
  id: "advanced_looker_table",
  label: "Advanced Looker Table",
  options: {}, 

  create: function(element) {
    element.innerHTML = 
      '<style>' +
      '  .table-scroll { width: 100%; height: 100%; overflow: auto; }' +
      '  table { border-collapse: collapse; width: 100%; table-layout: auto; font-family: \'Open Sans\', Arial, sans-serif; font-size: 13px; }' +
      '  th, td { padding: 8px 12px; border-bottom: 1px solid #dee2e6; white-space: normal; word-wrap: break-word; }' +
      '  th { cursor: pointer; position: relative; text-align: left; vertical-align: bottom; }' +
      
      /* FORCE TEXT STYLE FOR HEADERS - PREVENTS LINK LOOKS */
      '  th span, th a {' +
      '    color: inherit !important;' +
      '    text-decoration: none !important;' +
      '    cursor: default !important;' +
      '  }' +
      
      '  .view-name { font-size: 11px; color: #939ba5 !important; font-weight: 400; display: block; margin-bottom: 2px; text-decoration: none !important; }' +
      '  .field-name { font-size: 12px; color: #262d33 !important; font-weight: 600; display: block; text-decoration: none !important; }' +
      '  .truncate-text .view-name, .truncate-text .field-name, .truncate-text td {' +
      '    white-space: nowrap !important; overflow: hidden; text-overflow: ellipsis; max-width: 150px;' +
      '  }' +
      
      /* SHADES */
      '  .dim-header { background: #dceaf8 !important; border-right: 1px solid #c5dcf1; }' +
      '  .dim-cell { background: #f4f8fc !important; border-right: 1px solid #e2eef9; }' +
      '  .measure-header { background: #ede7e0 !important; }' +
      '  .measure-cell { background: #ffffff !important; }' +
      '  .calc-header { background: #dff0d8 !important; border-bottom: 2px solid #bcdfb3; }' +
      '  .calc-cell { background: #f2f9f2 !important; }' +
      
      '  .numeric { text-align: right; }' +
      '  .total-cell { background: #e8e8e8; font-weight: bold; }' +
      '  .row-num { background: #f8f9fa; color: #939ba5; width: 30px; text-align: center; border-right: 1px solid #dee2e6; }' +
      '  .resize-handle { position: absolute; right: 0; top: 0; width: 4px; height: 100%; cursor: col-resize; }' +
      '  thead { position: sticky; top: 0; z-index: 5; }' +
      '  td:first-child, th:first-child { position: sticky; left: 0; z-index: 4; }' +
      '  tfoot td { position: sticky; bottom: 0; z-index: 3; background: #e8e8e8; }' +
      '  .is-printing .table-scroll { overflow: visible !important; height: auto !important; width: 100% !important; }' +
      '  .is-printing thead, .is-printing thead th, .is-printing td:first-child, .is-printing th:first-child, .is-printing tfoot td { position: static !important; }' +
      '  .is-printing table { font-size: 11px !important; }' +
      '  .is-printing th, .is-printing td { padding: 4px !important; }' +
      '</style>' +
      '<div class="table-scroll"><div id="table_container"></div></div>';
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    var dimensions = queryResponse.fields.dimension_like || [];
    var allMeasuresLike = queryResponse.fields.measure_like || [];
    var tableCalcs = queryResponse.fields.table_calculations || [];
    
    var calcNames = tableCalcs.map(function(c) { return c.name; });
    var measures = allMeasuresLike.filter(function(m) { return calcNames.indexOf(m.name) === -1; });
    var pivots = queryResponse.pivots || [];
    var pivotFields = queryResponse.fields.pivots || [];
    var hasPivot = pivots.length > 0;
    var fieldsToTotal = [].concat(measures, tableCalcs);
    var allFields = [].concat(dimensions, measures, tableCalcs);

    var TAB_PLOT = "\u200BPlot";             
    var TAB_SERIES = "\u200B\u200BSeries";     
    var TAB_FORMAT = "\u200B\u200B\u200BFormatting"; 

    var dynamicOptions = {};

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

    var sortColumn = null;
    var sortDirection = 1;

    function checkIsPivoted(fieldName) {
      if (!hasPivot || !data || data.length === 0) return false;
      var pivotKey = pivots[0].key;
      for (var i = 0; i < Math.min(data.length, 5); i++) {
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

    function getPivotLabelsArray(pivotKey) {
      var pivotObj = pivots.filter(function(p) { return p.key === pivotKey; })[0];
      if (!pivotObj || !pivotObj.labels) return [pivotKey];
      if (typeof pivotObj.labels.join === 'function') {
        return pivotObj.labels;
      }
      var arr = [];
      for (var key in pivotObj.labels) {
        if (pivotObj.labels.hasOwnProperty(key)) {
          arr.push(pivotObj.labels[key]);
        }
      }
      return arr;
    }

    function flattenData() {
      var headers = [];
      var rows = [];

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
        var flatRow = [];
        headers.forEach(function(h) {
          var cellData = row[h.name];
          if (h.pivot && cellData) { cellData = cellData[h.pivot]; }
          flatRow.push({ cell: cellData, header: h });
        });
        rows.push(flatRow);
      });
      return { headers, rows };
    }

    function render() {
      var flat = flattenData();
      var headers = flat.headers;
      var rows = flat.rows;
      
      var columnTotals = [];
      for (var tIdx = 0; tIdx < headers.length; tIdx++) {
        columnTotals.push(0);
      }

      var numPivotLevels = hasPivot ? getPivotLabelsArray(pivots[0].key).length : 0;
      var maxHeaderRows = numPivotLevels + 1;
      
      var headerGrid = [];
      for (var r = 0; r < maxHeaderRows; r++) {
        var rowArr = [];
        for (var cIdx = 0; cIdx < headers.length; cIdx++) {
          rowArr.push(null);
        }
        headerGrid.push(rowArr);
      }

      headers.forEach(function(h, i) {
        var cls = h.type === "dimension" ? "dim-header" : (h.type === "calculation" ? "calc-header" : "measure-header");
        var fieldKey = h.field ? h.field.name : h.name;
        var customLabel = config["custom_label_" + fieldKey];
        var viewName = (h.field && h.field.view_label) ? h.field.view_label : "";
        
        var fieldName = h.label;
        if (h.field) {
          fieldName = h.field.label_short || h.field.label || h.field.name;
        }
        if (customLabel && typeof customLabel === 'string' && customLabel.trim() !== "") {
          fieldName = customLabel;
        }

        if (!h.pivot) {
          // --- FIX 1: POPULATE EXPLICIT PIVOT DIMENSION NAMES IN LEFT HEADER COLUMNS ---
          if (h.type === "dimension" && hasPivot) {
            for (var pLevel = 0; pLevel < numPivotLevels; pLevel++) {
              var pField = pivotFields[pLevel];
              var pFieldName = pField ? (pField.label_short || pField.label || pField.name) : "";
              var pViewName = pField ? (pField.view_label || "") : "";
              var pHeaderText = "";
              if (pViewName !== "") {
                pHeaderText = '<span class="view-name">' + pViewName + '</span><span class="field-name">' + pFieldName + '</span>';
              } else {
                pHeaderText = '<span class="field-name">' + pFieldName + '</span>';
              }
              headerGrid[pLevel][i] = { html: pHeaderText, rowspan: 1, colspan: 1, cls: cls };
            }
            
            var dimHeaderText = "";
            if (viewName !== "") {
              dimHeaderText = '<span class="view-name">' + viewName + '</span><span class="field-name">' + fieldName + '</span>';
            } else {
              dimHeaderText = '<span class="field-name">' + fieldName + '</span>';
            }
            headerGrid[maxHeaderRows - 1][i] = { html: dimHeaderText, rowspan: 1, colspan: 1, cls: cls };
          } else {
            var headerText = "";
            if (config.show_full_field_name && viewName !== "") {
              headerText = '<span class="field-name">' + viewName + ' ' + fieldName + '</span>';
            } else if (viewName !== "") {
              headerText = '<span class="view-name">' + viewName + '</span><span class="field-name">' + fieldName + '</span>';
            } else {
              headerText = '<span class="field-name">' + fieldName + '</span>';
            }
            headerGrid[0][i] = { html: headerText, rowspan: maxHeaderRows, colspan: 1, cls: cls };
          }
        } else {
          // --- FIX 4: APPLIED 'dim-header' BLUE SHADING TO THE PIVOT VALUES ---
          var labels = getPivotLabelsArray(h.pivot);
          for (var pLevel = 0; pLevel < numPivotLevels; pLevel++) {
            headerGrid[pLevel][i] = { 
              html: '<span class="field-name">' + (labels[pLevel] || "") + '</span>', 
              rowspan: 1, 
              colspan: 1, 
              cls: 'dim-header' 
            };
          }
          
          // --- FIX 3: RESTORED THE EXPLORE/VIEW LABEL FOR PIVOTED METRIC CELLS ---
          var measureHeaderText = "";
          if (config.show_full_field_name && viewName !== "") {
            measureHeaderText = '<span class="field-name">' + viewName + ' ' + fieldName + '</span>';
          } else if (viewName !== "") {
            measureHeaderText = '<span class="view-name">' + viewName + '</span><span class="field-name">' + fieldName + '</span>';
          } else {
            measureHeaderText = '<span class="field-name">' + fieldName + '</span>';
          }
          headerGrid[maxHeaderRows - 1][i] = { html: measureHeaderText, rowspan: 1, colspan: 1, cls: cls };
        }
      });

      if (hasPivot) {
        for (var rLevel = 0; rLevel < numPivotLevels; rLevel++) {
          for (var colIdx = 0; colIdx < headers.length; colIdx++) {
            var currentCell = headerGrid[rLevel][colIdx];
            if (!currentCell) continue;
            
            var checkNextIdx = colIdx + 1;
            while (checkNextIdx < headers.length) {
              var nextCell = headerGrid[rLevel][checkNextIdx];
              if (nextCell && nextCell.html === currentCell.html && (!!headers[colIdx].pivot === !!headers[checkNextIdx].pivot)) {
                var structuresMatch = true;
                if (headers[colIdx].pivot) {
                  for (var parentRow = 0; parentRow < rLevel; parentRow++) {
                    var parentLabelsI = getPivotLabelsArray(headers[colIdx].pivot);
                    var parentLabelsJ = getPivotLabelsArray(headers[checkNextIdx].pivot);
                    if (parentLabelsI[parentRow] !== parentLabelsJ[parentRow]) {
                      structuresMatch = false;
                      break;
                    }
                  }
                }
                if (structuresMatch) {
                  currentCell.colspan++;
                  headerGrid[rLevel][checkNextIdx] = null;
                  checkNextIdx++;
                } else {
                  break;
                }
              } else {
                break;
              }
            }
          }
        }
      }

      var tableClass = config.truncate_column_names ? "truncate-text" : "";
      var html = '<table class="' + tableClass + '"><thead>';
      
      for (var rowIdx = 0; rowIdx < maxHeaderRows; rowIdx++) {
        html += '<tr>';
        if (rowIdx === 0 && config.show_row_numbers) {
          html += '<th class="dim-header row-num" rowspan="' + maxHeaderRows + '">#</th>';
        }
        
        for (var colIndex = 0; colIndex < headers.length; colIndex++) {
          var targetGridCell = headerGrid[rowIdx][colIndex];
          if (!targetGridCell) continue;
          
          var geometryAttributes = '';
          if (targetGridCell.rowspan > 1) geometryAttributes += ' rowspan="' + targetGridCell.rowspan + '"';
          if (targetGridCell.colspan > 1) geometryAttributes += ' colspan="' + targetGridCell.colspan + '"';
          
          geometryAttributes += ' data-index="' + colIndex + '"';
          html += '<th class="' + targetGridCell.cls + '"' + geometryAttributes + '>' + targetGridCell.html + '<div class="resize-handle"></div></th>';
        }
        html += '</tr>';
      }
      html += "</thead><tbody>";

      rows.forEach(function(row, r) {
        html += "<tr>";
        if (config.show_row_numbers) html += '<td class="row-num">' + (r + 1) + '</td>';

        row.forEach(function(c, i) {
          var isDim = c.header.type === "dimension";
          var isCalc = c.header.type === "calculation";
          
          var val = 0;
          if (c.cell && c.cell.value !== undefined && c.cell.value !== null) { val = c.cell.value; }

          var isTotalEnabled = config["show_total_" + c.header.name];
          if (config.show_column_totals && isTotalEnabled && !isDim && !isRateOrPercent(c.header.field)) {
            columnTotals[i] += (typeof val === 'number' ? val : 0);
          }

          var cellClass = isDim ? 'dim-cell' : (isCalc ? 'calc-cell numeric' : 'measure-cell numeric');
          html += '<td class="' + cellClass + ' cell-drill" data-row="' + r + '" data-col="' + i + '">' + formatValue(c.cell, c.header.field) + '</td>';
        });
        html += "</tr>";
      });

      html += "</tbody>";

      if (config.show_column_totals) {
        html += "<tfoot><tr>";
        if (config.show_row_numbers) html += '<td class="total-cell row-num"></td>';

        headers.forEach(function(h, i) {
          var style = h.type === "dimension" ? "dim-cell" : "";
          if (h.type === "dimension") {
            html += '<td class="total-cell ' + style + '">' + (i === 0 ? "Total" : "") + '</td>';
          } else {
            var isTotalEnabled = config["show_total_" + h.name];
            var safeToSum = !isRateOrPercent(h.field);
            
            if (isTotalEnabled && safeToSum) {
              var totalVal = columnTotals[i];
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
          var idx = parseInt(this.dataset.index);
          sortDirection = (sortColumn === idx) ? sortDirection * -1 : 1;
          sortColumn = idx;
          rows.sort(function(a, b) {
            var vA = -Infinity, vB = -Infinity;
            if (a[idx] && a[idx].cell !== undefined && a[idx].cell !== null) { vA = a[idx].cell.value; }
            if (b[idx] && b[idx].cell !== undefined && b[idx].cell !== null) { vB = b[idx].cell.value; }
            return (vA < vB ? -1 : vA > vB ? 1 : 0) * sortDirection;
          });
          render();
        };
      });

      element.querySelectorAll(".cell-drill").forEach(function(cell) {
        cell.onclick = function(e) {
          var r = this.dataset.row, c = this.dataset.col;
          var cellData = rows[r][c].cell;
          if (cellData && cellData.links) { LookerCharts.Utils.openDrillMenu({ links: cellData.links, event: e }); }
        };
      });
    }

    render();
    setTimeout(function() { done(); }, 100);
  }
});
