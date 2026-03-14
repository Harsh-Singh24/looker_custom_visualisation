looker.plugins.visualizations.add({
  id: "table_totals",
  label: "Table with Totals",

  create: function (element) {

    element.innerHTML = `
      <style>

        .table-scroll {
          width:100%;
          height:100%;
          max-height:500px;
          overflow:auto;
        }

        .looker-like-table {
          width:100%;
          border-collapse:collapse;
          font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;
          font-size:13px;
        }

        th, td {
          padding:8px;
          border-bottom:1px solid #e5e5e5;
        }

        /* DIMENSION HEADER */
        .dim-header {
          background:#dce6f2;
          font-weight:600;
          position:sticky;
          top:0;
          z-index:3;
        }

        /* MEASURE HEADER */
        .measure-header {
          background:#d8cbb7;
          font-weight:600;
          position:sticky;
          top:0;
          z-index:3;
        }

        /* TOTAL HEADER */
        .total-header {
          background:#dff0d8;
          font-weight:600;
          position:sticky;
          top:0;
          z-index:3;
        }

        /* DATA ROWS */
        tbody tr:nth-child(even){
          background:#f7f7f7;
        }

        tbody tr:hover{
          background:#efefef;
        }

        .numeric {
          text-align:right;
        }

        /* TOTAL CELLS */
        .total-cell {
          background:#dff0d8;
          font-weight:bold;
        }

        /* STICKY TOTAL ROW */
        tfoot tr {
          position:sticky;
          bottom:0;
          z-index:2;
        }

      </style>

      <div class="table-scroll">
        <div id="table_totals_container"></div>
      </div>
    `
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {

    const dimensions = queryResponse.fields.dimension_like
    const measures = queryResponse.fields.measure_like

    let columnTotals = {}
    measures.forEach(m => columnTotals[m.name] = 0)

    let grandTotal = 0

    let html = `<table class="looker-like-table">`

    // HEADER
    html += "<thead><tr>"

    dimensions.forEach(d => {
      html += `<th class="dim-header">${d.label}</th>`
    })

    measures.forEach(m => {
      html += `<th class="measure-header numeric">${m.label}</th>`
    })

    html += `<th class="total-header numeric">Row Total</th>`

    html += "</tr></thead>"

    // BODY
    html += "<tbody>"

    data.forEach(row => {

      html += "<tr>"
      let rowTotal = 0

      dimensions.forEach(d => {
        html += `<td>${row[d.name]?.value ?? ""}</td>`
      })

      measures.forEach(m => {

        let value = row[m.name]?.value ?? 0

        rowTotal += value
        columnTotals[m.name] += value

        html += `<td class="numeric">${value}</td>`
      })

      grandTotal += rowTotal

      html += `<td class="numeric total-cell">${rowTotal}</td>`

      html += "</tr>"
    })

    html += "</tbody>"

    // TOTAL ROW
    html += "<tfoot><tr>"

    if (dimensions.length > 0) {

      html += `<td class="total-cell">Total</td>`

      for (let i = 1; i < dimensions.length; i++) {
        html += `<td class="total-cell"></td>`
      }
    }

    measures.forEach(m => {

      html += `<td class="numeric total-cell">${columnTotals[m.name]}</td>`

    })

    html += `<td class="numeric total-cell">${grandTotal}</td>`

    html += "</tr></tfoot>"

    html += "</table>"

    element.querySelector("#table_totals_container").innerHTML = html

    done()
  }
})
