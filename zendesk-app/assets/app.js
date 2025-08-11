(function(){
  var client = ZAFClient.init();
  client.invoke('resize', { width: '100%', height: '200px' });

  function getSetting(name) {
    return client.metadata().then(function(meta){ return (meta.settings && meta.settings[name]) || ''; });
  }

  function el(id){ return document.getElementById(id); }
  function clear(elm){ while (elm.firstChild) elm.removeChild(elm.firstChild); }
  function link(url){ var a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=url; return a; }

  function isRealLink(s){ if(!s||typeof s!=='string')return false; var t=s.trim(); if(!/^https?:\/\//i.test(t))return false; if(t.indexOf('#{')>-1||t.toLowerCase().indexOf('{trackingno')>-1||t.indexOf('${')>-1)return false; return true; }

  document.addEventListener('DOMContentLoaded', function(){
    var form = el('form');
    var orderInput = el('orderName');
    var status = el('status');
    var out = el('out');

    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      clear(out); out.style.display='none'; status.textContent='Loading...';
      var orderName = (orderInput.value||'').trim();
      if(!orderName){ status.textContent='Enter order like #121543'; return; }

      getSetting('backendUrl').then(function(backendUrl){
        var url = backendUrl.replace(/\/$/, '') + '/api/links';
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderName: orderName })
        }).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, data: j }; }); })
        .then(function(resp){
          if(!resp.ok){ throw new Error(resp.data && resp.data.error || 'Request failed'); }
          status.textContent='';
          var frag=document.createDocumentFragment();
          if(isRealLink(resp.data.courierQueryLink)){
            var d1=document.createElement('div'); d1.appendChild(link(resp.data.courierQueryLink)); frag.appendChild(d1);
          } else {
            var d2=document.createElement('div'); d2.textContent='No carrier link found.'; frag.appendChild(d2);
          }
          if(resp.data.parcelsLink){
            var d3=document.createElement('div'); d3.appendChild(link(resp.data.parcelsLink)); frag.appendChild(d3);
          }
          out.appendChild(frag); out.style.display='block';
        })
        .catch(function(err){ status.textContent = err.message || 'Unexpected error'; });
      });
    });
  });
})();
