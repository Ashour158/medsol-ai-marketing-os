"use client";
import {useState} from "react";
import {WORKSPACE_LINKS,filterWorkspaceLinks} from "../lib/workspace-navigation";
export default function WorkspaceNavigation({authenticated,focused,onNavigate,onShowAll}:{authenticated:boolean;focused:string;onNavigate:(id:string)=>void;onShowAll:()=>void}){
 const [query,setQuery]=useState("");
 const [category,setCategory]=useState("All");
 const match=filterWorkspaceLinks(query).filter(x=>category==="All"||x.category===category);
 return <nav aria-label="Marketing workspaces" className="alpha-sidebar">
  <h2>Workspace directory</h2>
  <p className="alpha-subtle">{authenticated?"Authorized session":"Sign in to open protected tools"}</p>
  <button type="button" style={{width:"100%"}} onClick={onShowAll}>Show all workspaces</button>
  <label>Find workspace<input aria-label="Find workspace" type="search" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="Search modules"/></label>
  <label>Group<select aria-label="Workspace group" value={category} onChange={e=>setCategory(e.target.value)}>{["All","Execute","Intelligence","Govern","Operate"].map(x=><option key={x}>{x}</option>)}</select></label>
  <div className="alpha-nav-links">
   {(["Operate","Execute","Intelligence","Govern"] as const).map(group=>{const links=match.filter(x=>x.category===group);return links.length>0&&<div key={group} style={{display:"contents"}}><div className="alpha-nav-group">{group}</div>{links.map(x=><a key={x.id} href={"#"+x.id} aria-current={focused===x.id?"location":undefined} onClick={e=>{e.preventDefault();onNavigate(x.id)}}>{x.label}</a>)}</div>})}
  </div>
  {match.length===0&&<p role="status" className="alpha-subtle">No matching workspace. Clear the filter to show every module.</p>}
  <p className="alpha-subtle">Navigation is not authorization. Server permissions remain authoritative.</p>
 </nav>
}
