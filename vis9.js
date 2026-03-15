
looker.plugins.visualizations.add({
  id: "table_totals",
  label: "Table with Totals",

  create: function (element) {

    element.innerHTML = `
      <style>

        .table-scroll{
          width:100%;
          height:100%;
          max-height:500px;
          overflow:auto;
        }

        table{
          border-collapse:collapse;
          width:100%;
          font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;
          font-size:10px;
        }

        th, td{
          padding:8px;
          border-bottom:1px solid #e5e5e5;
          white-space:nowrap;
        }

        th{
          cursor:pointer;
          position:relative;
        }

        /* dimension header */
        .dim-header{
          background:#dce6f2;
          position:sticky;
          top:0;
          z-index:3;
        }

        /* measure header */
        .measure-header{
          background:#d8cbb7;
          position:sticky;
          top:0;
          z-index:3;
        }

        /* total header */
        .total-header{
          background:#dff0d8;
          position:sticky;
          top:0;
          z-index:3;
        }

        /* totals */
        .total-cell{
          background:#dff0d8;
          font-weight:bold;
        }

        tbody tr:nth-child(even){
          background:#f7f7f7;
        }

        tbody tr:hover{
          background:#efefef;
        }

        .numeric{
          text-align:right;
        }

        /* sticky totals row */
        tfoot tr{
          position:sticky;
          bottom:0;
          z-index:2;
        }

        /* freeze first column */
        td:first-child, th:first-child{
          position:sticky;
          left:0;
          background:#dce6f2;
          z-index:4;
        }

        /* resize handle */
        .resize-handle{
          position:absolute;
          right:0;
          top:0;
          width:5px;
          height:100%;
          cursor:col-resize;
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

    let sortColumn=null
    let sortDirection=1

    function formatValue(value,field){

      if(value==null) return ""

      if(field.value_format){

        if(field.value_format.includes("%")){
          return (value*100).toFixed(2)+"%"
        }

        if(field.value_format.includes("$")){
          return "$"+value.toLocaleString()
        }
      }

      if(typeof value==="number"){
        return value.toLocaleString()
      }

      return value
    }

    function renderTable(sortedData){

      let columnTotals={}
      measures.forEach(m=>columnTotals[m.name]=0)

      let grandTotal=0

      let html="<table>"

      html+="<thead><tr>"

      dimensions.forEach((d,i)=>{
        html+=`<th class="dim-header" data-index="${i}">
        ${d.label}
        <div class="resize-handle"></div>
        </th>`
      })

      measures.forEach((m,i)=>{
        html+=`<th class="measure-header numeric" data-index="${dimensions.length+i}">
        ${m.label}
        <div class="resize-handle"></div>
        </th>`
      })

      html+=`<th class="total-header numeric">Row Total</th>`
      html+="</tr></thead>"

      html+="<tbody>"

      sortedData.forEach(row=>{

        html+="<tr>"
        let rowTotal=0

        dimensions.forEach(d=>{
          html+=`<td>${row[d.name]?.value ?? ""}</td>`
        })

        measures.forEach(m=>{

          let value=row[m.name]?.value ?? 0

          rowTotal+=value
          columnTotals[m.name]+=value

          html+=`<td class="numeric">${formatValue(value,m)}</td>`
        })

        grandTotal+=rowTotal

        html+=`<td class="numeric total-cell">${formatValue(rowTotal,{})}</td>`

        html+="</tr>"
      })

      html+="</tbody>"

      html+="<tfoot><tr>"

      html+=`<td class="total-cell">Total</td>`

      for(let i=1;i<dimensions.length;i++){
        html+=`<td class="total-cell"></td>`
      }

      measures.forEach(m=>{
        html+=`<td class="numeric total-cell">${formatValue(columnTotals[m.name],m)}</td>`
      })

      html+=`<td class="numeric total-cell">${formatValue(grandTotal,{})}</td>`

      html+="</tr></tfoot>"

      html+="</table>"

      element.querySelector("#table_totals_container").innerHTML=html

      /* sorting */

      element.querySelectorAll("th[data-index]").forEach(header=>{

        header.addEventListener("click",function(){

          const index=parseInt(this.dataset.index)

          if(sortColumn===index){
            sortDirection*=-1
          }else{
            sortColumn=index
            sortDirection=1
          }

          sortedData.sort((a,b)=>{

            let valA,valB

            if(index<dimensions.length){

              valA=a[dimensions[index].name]?.value
              valB=b[dimensions[index].name]?.value

            }else{

              let m=measures[index-dimensions.length]

              valA=a[m.name]?.value
              valB=b[m.name]?.value

            }

            if(valA<valB) return -1*sortDirection
            if(valA>valB) return 1*sortDirection
            return 0
          })

          renderTable(sortedData)

        })
      })

      /* column resize */

      const ths=element.querySelectorAll("th")

      ths.forEach(th=>{

        const handle=th.querySelector(".resize-handle")
        if(!handle) return

        let startX,startWidth

        handle.addEventListener("mousedown",function(e){

          startX=e.pageX
          startWidth=th.offsetWidth

          function resize(e){
            th.style.width=startWidth+(e.pageX-startX)+"px"
          }

          function stop(){
            document.removeEventListener("mousemove",resize)
            document.removeEventListener("mouseup",stop)
          }

          document.addEventListener("mousemove",resize)
          document.addEventListener("mouseup",stop)

        })
      })

    }

    renderTable([...data])

    done()
  }
})
