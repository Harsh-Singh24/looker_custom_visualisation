looker.plugins.visualizations.add({
  id: "table_totals",
  label: "Table with Row & Column Totals",

  create: function(element) {
    element.innerHTML = "<div id='totals-table'></div>";
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {

    const measures = queryResponse.fields.measures.map(m => m.name)

    let columnTotals = {}
    measures.forEach(m => columnTotals[m] = 0)

    let html = "<table border='1'><tr>"

    // headers
    queryResponse.fields.dimension_like.forEach(d => {
      html += "<th>" + d.label + "</th>"
    })

    measures.forEach(m => {
      html += "<th>" + m + "</th>"
    })

    html += "<th>Row Total</th></tr>"

    // rows
    data.forEach(row => {

      let rowTotal = 0
      html += "<tr>"

      queryResponse.fields.dimension_like.forEach(d => {
        html += "<td>" + row[d.name].value + "</td>"
      })

      measures.forEach(m => {

        let val = row[m].value || 0

        rowTotal += val
        columnTotals[m] += val

        html += "<td>" + val + "</td>"
      })

      html += "<td>" + rowTotal + "</td>"
      html += "</tr>"
    })

    // column totals row
    html += "<tr><td><b>Total</b></td>"

    queryResponse.fields.dimension_like.slice(1).forEach(() => {
      html += "<td></td>"
    })

    let grandTotal = 0

    measures.forEach(m => {
      html += "<td><b>" + columnTotals[m] + "</b></td>"
      grandTotal += columnTotals[m]
    })

    html += "<td><b>" + grandTotal + "</b></td>"
    html += "</tr>"

    html += "</table>"

    element.innerHTML = html

    done()
  }
})
