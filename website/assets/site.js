(function(){
  var ua=navigator.userAgent, os=/Windows/.test(ua)?'windows':/Mac/.test(ua)?'macos':/Linux|X11/.test(ua)?'linux':null;
  var mine=os&&document.querySelector('.osc[data-os="'+os+'"]');
  if(mine){ mine.classList.add('mine'); var y=document.createElement('span'); y.className='yours'; y.textContent=document.documentElement.lang==='fr'?'Votre système':'Your system'; mine.querySelector('h3').appendChild(y); }
})();
(function(){
  var bar=document.querySelector('.top');
  function nav(){ bar.classList.toggle('scrolled', scrollY>8); }
  addEventListener('scroll',nav,{passive:true}); nav();
  var still =matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(still) return;
  document.documentElement.classList.add('js');
  // window flattens as it scrolls into the middle of the screen
  var tilt=document.getElementById('tilt'), scene=document.getElementById('scene'), tick=false;
  function frame(){
    tick=false;
    if(!scene) return; // pages without the tilted window (the blog)
    var r=scene.getBoundingClientRect(), vh=innerHeight;
    var p=Math.min(1,Math.max(0,(vh*0.95-r.top)/(vh*0.75)));
    tilt.style.setProperty('--rx',(16*(1-p)).toFixed(2)+'deg');
    tilt.style.setProperty('--sc',(0.94+0.06*p).toFixed(3));
  }
  addEventListener('scroll',function(){ if(!tick){tick=true;requestAnimationFrame(frame);} },{passive:true});
  addEventListener('resize',frame); frame();
  // sections rise, numbers count, the agent log plays
  function count(el){
    var n=+el.dataset.n; if(!n) return;
    var t=el.firstChild, s=performance.now();
    (function step(now){ var k=Math.min(1,(now-s)/1100); t.nodeValue=Math.round(n*(1-Math.pow(1-k,3))); if(k<1) requestAnimationFrame(step); })(s);
  }
  function play(c){
    c.classList.add('run');
    [].forEach.call(c.querySelectorAll('.lines div'),function(d,i){ setTimeout(function(){d.classList.add('in');},350+i*420); });
  }
  if(!('IntersectionObserver' in window)){ document.documentElement.classList.remove('js'); return; }
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(!e.isIntersecting) return;
      e.target.classList.add('seen');
      var s=e.target.querySelector('strong[data-n]'); if(s) count(s);
      if(e.target.id==='console') play(e.target);
      io.unobserve(e.target);
    });
  },{threshold:.25});
  [].forEach.call(document.querySelectorAll('.rise'),function(el){io.observe(el);});
})();
// Language: remember a choice made with the switch, and offer the other
// language once to a browser set to it. Never redirect.
(function(){
  var KEY='regards-lang', hint=document.getElementById('suggest'), chosen=null;
  try{ chosen=localStorage.getItem(KEY); }catch(e){}
  [].forEach.call(document.querySelectorAll('.lang a, #suggest'),function(a){
    a.addEventListener('click',function(){ try{ localStorage.setItem(KEY,a.lang); }catch(e){} });
  });
  if(!hint || chosen) return;
  var wants=(navigator.language||'').slice(0,2).toLowerCase();
  if(wants===hint.lang && wants!==document.documentElement.lang) hint.hidden=false;
})();
// The speed page: the counter and the race run at the speed that was
// measured. The page is written with the race finished, which is what stays
// without a script or when motion is reduced (no "js" class then).
(function(){
  var race=document.getElementById('race'), clock=document.getElementById('clock');
  if(!race || !document.documentElement.classList.contains('js')) return;
  var lanes=[].map.call(race.querySelectorAll('.sp-lane'),function(el){
    return {el:el, ms:+el.dataset.ms, bar:el.querySelector('i'), time:el.querySelector('code'), state:el.querySelector('em')};
  });
  var scale=+race.dataset.scale, sep=race.dataset.sep, raf=0;
  var end=Math.max.apply(null,lanes.map(function(l){return l.ms;}));
  function text(ms){ return (ms/1000).toFixed(2).replace('.',sep); }
  function draw(t){
    if(clock) clock.textContent=text(Math.min(t,+clock.dataset.ms));
    lanes.forEach(function(l){
      var shown=Math.min(t,l.ms), done=t>=l.ms;
      l.bar.style.setProperty('--w',(100*shown/scale).toFixed(2)+'%');
      l.time.textContent=text(shown)+' s';
      l.state.textContent=done?race.dataset.on:race.dataset.off;
      l.el.classList.toggle('wait',!done);
    });
  }
  function run(){
    cancelAnimationFrame(raf);
    var start=performance.now();
    (function step(now){
      var t=Math.min(end,now-start);
      draw(t);
      if(t<end) raf=requestAnimationFrame(step);
    })(start);
  }
  race.querySelector('.sp-again').addEventListener('click',run);
  run();
})();
