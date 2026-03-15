looker.plugins.visualizations.add({

id: "advanced_table",
label: "Advanced Table",

options: {

show_column_totals: {
type: "boolean",
label: "Show Column Totals",
default: true
},

freeze_first_column: {
type: "boolean",
label: "Freeze First Column",
default: true
},

sticky_header: {
type: "boolean",
label: "Sticky Header",
default: true
},

freeze_totals: {
type: "boolean",
label: "Freeze Totals Row",
default: true
},

table_height: {
type: "number",
label: "Table Height",
default: 500
}

},

create: function(element){

element.innerHTML = `
<style>

.table-scroll{
width:100%;
overflow:auto;
}

table{
border-collapse:collapse;
width:100%;
font-family:Arial;
font-size:13px;
}

th,td{
padding:8px;
border-bottom:1px solid #e5e5e5;
white-space:nowrap;
background:#fff;
}

th{
cursor:pointer;
}

.dim-header{
background:#dce6f2;
}

.measure-header{
background:#d8cbb7;
}

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
<div id="table_container"></div>
</div>
`

},

updateAsync: function(data, element, config, queryResponse, details, done){

const dimensions = queryResponse.fields.dimension_like
const measures = queryResponse.fields.measure_like

const scroll = element.querySelector(".table-scroll")
scroll.style.maxHeight = config.table_height + "px"

let sortColumn=null
let sortDirection=1

function formatValue(cell){

if(!cell) return ""

if(cell.rendered!==undefined){
return cell.rendered
}

let v=cell.value

if(typeof v==="number"){
return v.toLocaleString()
}

return v
}

function renderTable(sortedData){

let columnTotals={}
measures.forEach(m=>columnTotals[m.name]=0)

let html="<table>"

html+="<thead><tr>"

dimensions.forEach((d,i)=>{
html+=`<th class="dim-header" data-index="${i}">${d.label}<div class="resize-handle"></div></th>`
})

measures.forEach((m,i)=>{
html+=`<th class="measure-header numeric" data-index="${dimensions.length+i}">${m.label}<div class="resize-handle"></div></th>`
})

html+="</tr></thead>"

html+="<tbody>"

sortedData.forEach(row=>{

html+="<tr>"

dimensions.forEach(d=>{
html+=`<td>${row[d.name]?.value ?? ""}</td>`
})

measures.forEach(m=>{

let value=row[m.name]?.value ?? 0
columnTotals[m.name]+=value

html+=`<td class="numeric">${formatValue(row[m.name])}</td>`
})

html+="</tr>"

})

html+="</tbody>"

if(config.show_column_totals){

html+="<tfoot><tr>"

html+=`<td class="total-cell">Total</td>`

for(let i=1;i<dimensions.length;i++){
html+=`<td class="total-cell"></td>`
}

measures.forEach(m=>{
html+=`<td class="numeric total-cell">${columnTotals[m.name].toLocaleString()}</td>`
})

html+="</tr></tfoot>"

}

html+="</table>"

element.querySelector("#table_container").innerHTML=html

applySticky()
applySorting(sortedData)
applyResize()

}

function applySticky(){

if(config.sticky_header){

element.querySelectorAll("thead th").forEach(th=>{
th.style.position="sticky"
th.style.top="0"
th.style.zIndex="5"
})

}

if(config.freeze_first_column){

element.querySelectorAll("td:first-child, th:first-child").forEach(c=>{
c.style.position="sticky"
c.style.left="0"
c.style.zIndex="4"
})

}

if(config.freeze_totals){

element.querySelectorAll("tfoot td").forEach(td=>{
td.style.position="sticky"
td.style.bottom="0"
td.style.zIndex="3"
})

}

}

function applySorting(sortedData){

element.querySelectorAll("th[data-index]").forEach(header=>{

header.onclick=function(){

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

}

})

}

function applyResize(){

element.querySelectorAll("th").forEach(th=>{

const handle=th.querySelector(".resize-handle")
if(!handle) return

let startX,startWidth

handle.onmousedown=function(e){

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

}

})

}

renderTable([...data])

done()

}

})
