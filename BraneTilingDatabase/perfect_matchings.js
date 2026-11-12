/* Bounded browser reconstruction. Rows retain published edge order; stored phases are never changed. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BranePerfectMatchings=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const cache=new WeakMap();
  function derive(phase, {maxColumns=2000,maxVisits=250000,maxMs=70,expected=null}={}) {
    if(phase.pm_matrix)return phase.pm_matrix;
    if(cache.has(phase)){const matrix=cache.get(phase);return expected==null||BigInt(matrix[0].length)===BigInt(expected)?matrix:null;}
    const t=phase.tiling;
    if(!t?.edges?.length || !t.nodes?.length)return null;
    const black=t.nodes.map((n,i)=>n[2]===1?i:-1).filter(i=>i>=0);
    const white=t.nodes.map((n,i)=>n[2]!==1?i:-1).filter(i=>i>=0);
    if(!black.length||black.length!==white.length||black.length>20||t.edges.length>256)return null;
    maxColumns=Math.min(maxColumns,Math.floor(60000/t.edges.length));
    if(expected!=null && BigInt(expected)>BigInt(maxColumns))return null;
    const whites=new Set(white), adjacent=new Map(black.map(i=>[i,[]]));
    for(let i=0;i<t.edges.length;i++){const [b,w]=t.edges[i];if(!adjacent.has(b)||!whites.has(w))return null;adjacent.get(b).push([w,i]);}
    black.sort((a,b)=>adjacent.get(a).length-adjacent.get(b).length);
    const start=Date.now(), used=new Set(), chosen=[], found=[];
    let visits=0,aborted=false;
    function visit(k){
      if(aborted)return;
      if(++visits>maxVisits || (visits%128===0&&Date.now()-start>maxMs)){aborted=true;return;}
      if(k===black.length){if(found.length>=maxColumns){aborted=true;return;}found.push([...chosen]);return;}
      for(const [w,e]of adjacent.get(black[k])){if(used.has(w))continue;used.add(w);chosen.push(e);visit(k+1);chosen.pop();used.delete(w);if(aborted)return;}
    }
    visit(0);
    if(aborted || !found.length || (expected!=null && BigInt(found.length)!==BigInt(expected)))return null;
    const matrix=Array.from({length:t.edges.length},()=>Array(found.length).fill(0));
    found.forEach((matching,k)=>matching.forEach(e=>matrix[e][k]=1));cache.set(phase,matrix);return matrix;
  }
  return {derive};
});
