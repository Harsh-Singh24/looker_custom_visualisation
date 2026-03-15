looker.plugins.visualizations.add({

id:"advanced_looker_table",
label:"Advanced Looker Table",

options:{
freeze_first_column:{
type:"boolean",
label:"Freeze First Column",
default:true
},
freeze_totals:{
type:"boolean",
label:"Freeze Totals Row",
default:true
},
show_column_totals:{
type:"boolean",
label:"Show Column Totals",
default:true
}
},

create:function(element){

element.innerHTML=`

<style>

.table-scroll{
width:100%;
height:100%;
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
position:relative;
}

.dim-header{
background:#dce6f2;
}

.measure-header{
background:#d8cbb7;
}

.numeric{
text-align:right;
}

.total-cell{
background:#dff0d8;
font-weight:bold;
}

.resize-handle{
position:absolute;
right:0;
top:0;
width:5px;
height:100%;
cursor:col-resize;
}

/* sticky header */

thead th{
position:sticky;
top:0;
z-index:5;
}

/* frozen first column */

td:first-child,
th:first-child{
position:sticky;
left:0;
z-index:4;
background:#fff;
}

thead th:first-child{
z-index:6;
}

/* totals row */

tfoot td{
position:sticky;
bottom:0;
z-index:3;
background:#dff0d8;
}

tbody tr:nth-child(even){
background:#f7f7f7;
}

tbody tr:hover{
background:#efefef;
}

</style>

<div class="table-scroll">
<div id="table_container"></div>
</div>

`

},

updateAsync:function(data,element,config,queryResponse,details,done){

const dimensions=queryResponse.fields.dimension_like
const measures=queryResponse.fields.measure_like
const pivots=queryResponse.pivots||[]
const hasPivot=pivots.length>0

let sortColumn=null
let sortDirection=1

function formatValue(cell){

if(!cell) return ""

if(cell.rendered!==undefined)
return cell.rendered

let v=cell.value

if(typeof v==="number")
return v.toLocaleString()

return v

}

function drill(cell,event){

if(cell && cell.links){

LookerCharts.Utils.openDrillMenu({
links:cell.links,
event:event
})

}

}

function flattenData(){

let headers=[]
let rows=[]

dimensions.forEach(d=>{
headers.push({
type:"dimension",
name:d.name,
label:d.label
})
})

if(hasPivot){

pivots.forEach(p=>{

measures.forEach(m=>{

headers.push({
type:"measure",
name:m.name,
pivot:p.key,
label:p.key+" "+m.label,
field:m
})

})

})

}else{

measures.forEach(m=>{
headers.push({
type:"measure",
name:m.name,
label:m.label,
field:m
})
})

}

data.forEach(row=>{

let flatRow=[]

dimensions.forEach(d=>{
flatRow.push({
cell:row[d.name],
field:d
})
})

if(hasPivot){

pivots.forEach(p=>{

measures.forEach(m=>{

let cell=row[m.name]

if(cell && cell[p.key])
cell=cell[p.key]

flatRow.push({
cell:cell,
field:m
})

})

})

}else{

measures.forEach(m=>{

flatRow.push({
cell:row[m.name],
field:m
})

})

}

rows.push(flatRow)

})

return {headers,rows}

}

function render(){

const tableData=flattenData()
const headers=tableData.headers
const rows=tableData.rows

let columnTotals=new Array(headers.length).fill(0)

let html="<table>"

html+="<thead><tr>"

headers.forEach((h,i)=>{

const cls=h.type==="dimension"?"dim-header":"measure-header"

html+=`
<th class="${cls}" data-index="${i}">
${h.label}
<div class="resize-handle"></div>
</th>
`

})

html+="</tr></thead>"

html+="<tbody>"

rows.forEach((row,r)=>{

html+="<tr>"

row.forEach((c,i)=>{

let val=c.cell?.value ?? 0

if(
config.show_column_totals &&
c.field &&
!c.field.is_table_calculation &&
headers[i].type==="measure"
){
columnTotals[i]+=val
}

const numeric=headers[i].type==="measure"?"numeric":""

html+=`
<td class="${numeric} cell-drill"
data-row="${r}"
data-col="${i}">
${formatValue(c.cell)}
</td>
`

})

html+="</tr>"

})

html+="</tbody>"

if(config.show_column_totals){

html+="<tfoot><tr>"

headers.forEach((h,i)=>{

if(h.type==="dimension" && i===0){

html+=`<td class="total-cell">Total</td>`

}else if(h.type==="dimension"){

html+=`<td class="total-cell"></td>`

}else{

let val=columnTotals[i]

html+=`
<td class="numeric total-cell">
${val ? val.toLocaleString() : ""}
</td>
`

}

})

html+="</tr></tfoot>"

}

html+="</table>"

element.querySelector("#table_container").innerHTML=html

applySorting(headers,rows)
applyResize()
applyDrill(headers)

}

function applySorting(headers,rows){

element.querySelectorAll("th[data-index]").forEach(header=>{

header.onclick=function(){

const index=parseInt(this.dataset.index)

if(sortColumn===index)
sortDirection*=-1
else{
sortColumn=index
sortDirection=1
}

rows.sort((a,b)=>{

let valA=a[index].cell?.value
let valB=b[index].cell?.value

if(valA<valB) return -1*sortDirection
if(valA>valB) return 1*sortDirection
return 0

})

render()

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

function applyDrill(headers){

element.querySelectorAll(".cell-drill").forEach(cell=>{

cell.onclick=function(event){

const rowIndex=this.dataset.row
const colIndex=this.dataset.col
const header=headers[colIndex]
const rowData=data[rowIndex]

let cellData

if(header.type==="dimension"){
cellData=rowData[header.name]
}
else if(header.pivot){
cellData=rowData[header.name][header.pivot]
}
else{
cellData=rowData[header.name]
}

drill(cellData,event)

}

})

}

render()

done()

}

})
