"use client";
import {useState} from "react";
import {WORKSPACE_LINKS,filterWorkspaceLinks} from "../lib/workspace-navigation";

export default function WorkspaceNavigation({authenticated}:{authenticated:boolean}){
 const [query,setQuery]=useState("");
 const [category,setCategory]=useState("All");
 const match=filterWorkspaceLinks(query).filter(
  x=>category==="All"||x.category===category);
 return <nav aria-label="Marketing workspaces" style={{
  border:"1px solid #dce5ed",borderRadius:14,
  background:"#fff",padding:16,position:"sticky",top:0,zIndex:8,
  boxShadow:"0 4px 12px rgba(23,32,42,.06)"}}>
  <div style={{display:"flex",gap:12,justifyContent:"space-between",alignItems:"center",flexWrap:"wrap"}}>
   <div>
    <strong style={{color:"#124d83"}}>Workspace directory</strong>
    <div style={{fontSize:12,color:"#64748b"}}>
     {authenticated?"Signed in · accessible modules are still enforced by server roles":
      "Sign in before using protected workspaces"}
    </div>
   </div>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <label style={{fontSize:12,color:"#475569"}}>
     Find workspace
     <input aria-label="Find workspace" type="search" value={query}
      maxLength={100} onChange={e=>setQuery(e.target.value)}
      placeholder="Search modules" style={{
       display:"block",padding:"8px 10px",borderRadius:8,
       border:"1px solid #ccd8e5",minWidth:180}}/>
    </label>
    <label style={{fontSize:12,color:"#475569"}}>
     Group
     <select aria-label="Workspace group" value={category}
      onChange={e=>setCategory(e.target.value)} style={{
       display:"block",padding:"8px 10px",borderRadius:8,
       border:"1px solid #ccd8e5"}}>
      {["All","Execute","Intelligence","Govern","Operate"].map(x=>
       <option key={x}>{x}</option>)}
     </select>
    </label>
   </div>
  </div>
  <div style={{display:"flex",gap:8,overflowX:"auto",paddingTop:12,
   paddingBottom:4,scrollbarWidth:"thin"}}>
   {match.map(x=><a key={x.id} href={"#"+x.id} style={{
    flexShrink:0,display:"inline-block",fontSize:12,
    background:"#f1f6fa",border:"1px solid #d5e1ea",color:"#124d83",
    padding:"9px 11px",borderRadius:8,textDecoration:"none",fontWeight:600
   }}>{x.label}</a>)}
   {match.length===0&&<span role="status" style={{fontSize:12,color:"#64748b"}}>
    No matching workspace. Clear the filter to show every module.
   </span>}
  </div>
  <p style={{fontSize:11,color:"#64748b",margin:"8px 0 0"}}>
   Navigation is not authorization. External provider actions remain disabled;
   this interface is not production-certified.
  </p>
 </nav>;
}
