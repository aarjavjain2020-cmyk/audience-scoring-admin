/* Shared presentation only. Every page owns its own filter and chart mode. */
window.PollResults = (() => {
  const labels={en:{all:'All auditions',day:'Day',final:'Day 5 · Final',average:'Average points',total:'Total points',showTotal:'Show total points',showAverage:'Show average points',table:'Average results',name:'Performer',id:'Contestant ID',votes:'Votes',empty:'Results appear after voting closes.',export:'Download CSV',qualified:'Finalist',ballot:'Ballot',yes:'Yes',none:'No votes',outOf:'out of 20'},hi:{all:'सभी ऑडिशन',day:'दिन',final:'दिन 5 · फ़ाइनल',average:'औसत अंक',total:'कुल अंक',showTotal:'कुल अंक दिखाएँ',showAverage:'औसत अंक दिखाएँ',table:'औसत नतीजे',name:'कलाकार',id:'प्रतियोगी ID',votes:'मत',empty:'मतदान बंद होने पर नतीजे दिखेंगे।',export:'CSV डाउनलोड करें',qualified:'फ़ाइनलिस्ट',ballot:'पर्ची चयन',yes:'हाँ',none:'कोई मत नहीं',outOf:'20 में से'}};
  const id = n=>'C'+String(n).padStart(4,'0');
  const average = r=>r.votes>0?r.total/r.votes:null;
  const compare = (a,b)=>!a.votes||!b.votes?(b.votes>0)-(a.votes>0):b.total*a.votes-a.total*b.votes;
  const number = n=>n===null?'—':new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n);
  function el(tag,text,attrs={}) { const node=document.createElement(tag);if(text!==undefined)node.textContent=text;for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);return node; }
  function svg(tag,attrs={}) {const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);return node;}
  function create(root,{exportable=false}={}) {
    let data=null,lang='en',mode='average',filter=null,key='',frame=0,explicitFilter=false;
    const toolbar=el('div',undefined,{class:'result-toolbar'}),select=el('select',undefined,{'aria-label':'Results group'}),toggle=el('button',undefined,{type:'button',class:'metric-toggle'}),download=el('button',undefined,{type:'button',class:'metric-toggle'});
    toolbar.append(select,toggle);if(exportable)toolbar.append(download);
    const empty=el('p',undefined,{class:'empty'}),scroll=el('div',undefined,{class:'chart-scroll'}),chart=svg('svg',{role:'img'}),detail=el('output',undefined,{class:'chart-detail','aria-live':'polite'}),heading=el('h3'),tableScroll=el('div',undefined,{class:'table-scroll'}),table=el('table',undefined,{class:'results-table'});
    scroll.append(chart);tableScroll.append(table);root.replaceChildren(toolbar,empty,scroll,detail,heading,tableScroll);
    function rows(){return (data?.results||[]).filter(r=>filter==='all'?r.day<5:r.day===Number(filter));}
    function render(next,language) {
      if(!explicitFilter && next.competition.day===5)filter='5';data=next;lang=language;const t=labels[lang];if(filter===null)filter=data.competition.day===5?'5':'all';
      const signature=JSON.stringify([data.results,data.finalists,lang,mode,filter]);if(signature===key)return;key=signature;cancelAnimationFrame(frame);
      select.replaceChildren(...[['all',t.all],...Array.from({length:4},(_,i)=>[String(i+1),t.day+' '+(i+1)]),['5',t.final]].map(([value,text])=>el('option',text,{value})));
      select.value=filter;select.setAttribute('aria-label',t.table);toggle.textContent=mode==='average'?t.showTotal:t.showAverage;download.textContent=t.export;
      const ranked=rows().sort((a,b)=>(mode==='average'?compare(a,b):b.total-a.total)||a.number-b.number);
      empty.textContent=t.empty;empty.hidden=ranked.length>0;scroll.hidden=!ranked.length;heading.hidden=!ranked.length;tableScroll.hidden=!ranked.length;detail.textContent='';
      heading.textContent=t.table+' · '+t.outOf;
      const tableRows=rows().sort((a,b)=>compare(a,b)||a.number-b.number),thead=el('thead'),tr=el('tr');
      [t.id,t.name,t.day,t.average,t.votes,t.qualified].forEach(text=>tr.append(el('th',text,{scope:'col'})));thead.append(tr);const tbody=el('tbody');
      for(const r of tableRows){const row=el('tr'),finalist=data.finalists.find(f=>f.contestantId===r.contestantId);[id(r.contestantId),r.performer,r.day,number(average(r)),r.votes,finalist?(finalist.ballot?t.yes+' · '+t.ballot:t.yes):'—'].forEach(text=>row.append(el('td',text)));const mobileId=el('small',id(r.contestantId)+(finalist?' · '+t.qualified:''),{class:'mobile-contestant'});row.children[1].append(mobileId);tbody.append(row);}table.replaceChildren(thead,tbody);
      chart.replaceChildren();if(!ranked.length)return;
      const width=Math.max(340,root.clientWidth-4,ranked.length*92+70),height=350,left=52,top=32,bottom=105,plotHeight=height-top-bottom,plotWidth=width-left-16,baseline=top+plotHeight;
      const ceiling=mode==='average'?20:Math.max(20,Math.ceil(Math.max(...ranked.map(r=>r.total))/20)*20),step=plotWidth/ranked.length,barWidth=Math.min(48,step*.56);
      chart.setAttribute('width',width);chart.setAttribute('height',height);chart.setAttribute('viewBox',`0 0 ${width} ${height}`);chart.setAttribute('aria-label',mode==='average'?t.average+' · '+t.outOf:t.total);
      for(let i=0;i<=4;i++){const y=baseline-plotHeight*i/4;chart.append(svg('line',{x1:left,y1:y,x2:width-16,y2:y,stroke:'#e7ebed'}));const label=svg('text',{x:left-10,y:y+4,'text-anchor':'end',fill:'#647078','font-size':12});label.textContent=number(ceiling*i/4);chart.append(label);}
      const axis=svg('text',{x:13,y:top+plotHeight/2,transform:`rotate(-90 13 ${top+plotHeight/2})`,'text-anchor':'middle',fill:'#647078','font-size':12});axis.textContent=mode==='average'?t.average:t.total;chart.append(axis);
      const palette=['#4d83bc','#dd9862','#65a38b','#9a7bb5','#ca7d89','#b5a447'],bars=[];
      for(const [i,r] of ranked.entries()){
        const value=mode==='average'?average(r):r.total,cx=left+step*(i+.5),h=(value??0)/ceiling*plotHeight;
        const desc=`${r.performer} · ${id(r.contestantId)} · ${mode==='average'?t.average:t.total}: ${number(value)} · ${r.votes} ${t.votes}`;
        const rect=svg('rect',{x:cx-barWidth/2,y:baseline,width:barWidth,height:0,rx:3,fill:palette[(r.contestantId-1)%6],tabindex:0,'aria-label':desc});const title=svg('title');title.textContent=desc;rect.append(title);rect.addEventListener('focus',()=>detail.textContent=desc);rect.addEventListener('pointerenter',()=>detail.textContent=desc);
        const score=svg('text',{x:cx,y:baseline-9,'text-anchor':'middle',fill:'#33434d','font-size':13,'font-weight':600});score.textContent=number(value);chart.append(rect,score);bars.push({rect,score,h});
        const name=svg('text',{x:cx,y:baseline+20,transform:`rotate(-35 ${cx} ${baseline+20})`,'text-anchor':'end',fill:'#52616a','font-size':12});name.textContent=r.performer.length>22?r.performer.slice(0,21)+'…':r.performer;const full=svg('title');full.textContent=r.performer;name.append(full);chart.append(name);
        const code=svg('text',{x:cx,y:height-9,'text-anchor':'middle',fill:'#7a858b','font-size':11});code.textContent=id(r.contestantId);chart.append(code);
      }
      const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:650,start=performance.now();
      function animate(now){const p=duration?Math.min(1,(now-start)/duration):1,eased=1-Math.pow(1-p,3);for(const b of bars){const h=b.h*eased;b.rect.setAttribute('height',h);b.rect.setAttribute('y',baseline-h);b.score.setAttribute('y',baseline-h-9);}if(p<1)frame=requestAnimationFrame(animate);}frame=requestAnimationFrame(animate);
    }
    select.addEventListener('change',()=>{explicitFilter=true;filter=select.value;render(data,lang)});toggle.addEventListener('click',()=>{mode=mode==='average'?'total':'average';render(data,lang)});
    download.addEventListener('click',()=>{const values=[['Contestant ID','Performer','Day','Average / 20','Votes','Total points','Finalist','Ballot'],...rows().sort((a,b)=>compare(a,b)||a.number-b.number).map(r=>{const f=data.finalists.find(f=>f.contestantId===r.contestantId);return[id(r.contestantId),r.performer,r.day,average(r)??'',r.votes,r.total,f?'Yes':'',f?.ballot?'Yes':''];})];const csv=values.map(row=>row.map(v=>'"'+String(typeof v==='string'&&/^[=+@\-\t\r]/.test(v)?"'"+v:v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=el('a',undefined,{href:url,download:`results-${filter}.csv`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    return {render,rows,average,compare,id};
  }
  return {create,average,compare,id,labels};
})();
