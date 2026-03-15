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
},

totals_columns:{
type:"string",
label:"Columns Included in Totals (comma separated)",
placeholder:"campaigns.impressions,campaigns.clicks"
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

.total-cell{
background:#dff0d8;
font-weight:bold;
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
const pivots=queryResponse.fields.pivots || []

const totalsEnabled=(config.totals_columns||"")
.split(",")
map(v=>v.trim())

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

function drill(cell,field){

if(cell && cell.links){

LookerCharts.Utils.openDrillMenu({
links:cell.links,
event:event
})

}

}

function renderTable(sortedData){

let columnTotals={}
measures.forEach(m=>columnTotals[m.name]=0)

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

html+="</tr></thead>"

html+="<tbody>"

sortedData.forEach(row=>{

html+="<tr>"

dimensions.forEach(d=>{
html+=`<td>${row[d.name]?.value ?? ""}</td>`
})

measures.forEach(m=>{

let cell=row[m.name]
let value=cell?.value ?? 0

if(
config.show_column_totals &&
totalsEnabled.includes(m.name) &&
!m.is_table_calculation
){
columnTotals[m.name]+=value
}

html+=`<td class="numeric cell-drill">${formatValue(cell)}</td>`

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

let total=columnTotals[m.name]

html+=`<td class="numeric total-cell">
${totalsEnabled.includes(m.name)?total.toLocaleString():""}
</td>`

})

html+="</tr></tfoot>"

}

html+="</table>"

element.querySelector("#table_container").innerHTML=html

applySorting(sortedData)
applyResize()
applyDrill()

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

function applyDrill(){

element.querySelectorAll(".cell-drill").forEach((cell,i)=>{

cell.onclick=function(event){

const rowIndex=Math.floor(i/measures.length)
const colIndex=i%measures.length

const field=measures[colIndex]
const cellData=data[rowIndex][field.name]

drill(cellData,field)

}

})

}

renderTable([...data])

done()

}

})
