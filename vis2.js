looker.plugins.visualizations.add({
  id: "table_totals",
  label: "Table with Totals",

  create: function (element) {
    element.innerHTML = "<div id='table_totals_container'></div>";
    element.style.fontFamily = "Arial, sans-serif";
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {

    const dimensions = queryResponse.fields.dimension_like
    const measures = queryResponse.fields.measure_like

    let columnTotals = {}
    measures.forEach(m => columnTotals[m.name] = 0)

    let grandTotal = 0

    let html = "<table style='border-collapse:collapse;width:100%;'>"

    // HEADER
    html += "<thead><tr>"

    dimensions.forEach(d => {
      html += `<th style="border:1px solid #ccc;padding:6px;background:#f3f3f3">${d.label}</th>`
    })

    measures.forEach(m => {
      html += `<th style="border:1px solid #ccc;padding:6px;background:#f3f3f3">${m.label}</th>`
    })

    html += `<th style="border:1px solid #ccc;padding:6px;background:#e0e0e0">Row Total</th>`

    html += "</tr></thead>"

    // BODY
    html += "<tbody>"

    data.forEach(row => {

      html += "<tr>"
      let rowTotal = 0

      // dimensions
      dimensions.forEach(d => {
        html += `<td style="border:1px solid #ccc;padding:6px">${row[d.name]?.value ?? ""}</td>`
      })

      // measures
      measures.forEach(m => {

        let value = row[m.name]?.value ?? 0

        rowTotal += value
        columnTotals[m.name] += value

        html += `<td style="border:1px solid #ccc;padding:6px;text-align:right">${value}</td>`
      })

      grandTotal += rowTotal

      html += `<td style="border:1px solid #ccc;padding:6px;background:#fafafa;text-align:right"><b>${rowTotal}</b></td>`

      html += "</tr>"
    })

    html += "</tbody>"

    // COLUMN TOTALS ROW
    html += "<tfoot><tr style='background:#f7f7f7'>"

    if (dimensions.length > 0) {
      html += `<td style="border:1px solid #ccc;padding:6px"><b>Total</b></td>`
      for (let i = 1; i < dimensions.length; i++) {
        html += `<td style="border:1px solid #ccc;padding:6px"></td>`
      }
    }

    measures.forEach(m => {

      html += `<td style="border:1px solid #ccc;padding:6px;text-align:right"><b>${columnTotals[m.name]}</b></td>`

    })

    html += `<td style="border:1px solid #ccc;padding:6px;background:#e8e8e8;text-align:right"><b>${grandTotal}</b></td>`

    html += "</tr></tfoot>"

    html += "</table>"

    element.querySelector("#table_totals_container").innerHTML = html

    done()
  }
})
