// ---------- Utils ----------
function $(id){ return document.getElementById(id); }
function setText(id, v){ const el = $(id); if (el) el.textContent = v ?? '—'; }
function showResult(){ const box = $('result'); if (box) box.style.display = 'block'; }
function isHex64(s){ return /^[a-f0-9]{64}$/i.test(s || ''); }

function busy(btn, on, labelBusy='Working…', labelReady='Get Price & Payment Instructions'){
  if(!btn) return;
  btn.disabled = !!on;
  btn.textContent = on ? labelBusy : labelReady;
}

// ---------- Hash generator (client-side nonce + timestamp) ----------
async function generateHash(input) {
  if (!window.crypto?.subtle?.digest) {
    alert("Your browser does not support secure hashing.");
    throw new Error("Incompatible browser");
  }
  // Better entropy than Math.random()
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);

  const nowISO = new Date().toISOString();
  const combined = `${input}::${nowISO}::${Array.from(nonce).join('-')}`;

  const data = new TextEncoder().encode(combined);
  const buff = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(buff)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return { hash: hex, timestamp: nowISO };
}

// ---------- Main submit/check ----------
async function sendToServer(){
  const link    = $('textInput1').value.trim();
  const address = $('textInput3').value.trim();
  const email   = $('textInput4').value.trim();
  const btn     = document.querySelector('.btn'); // main CTA

  if (!link){
    alert("Paste a product link or an existing order hash.");
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    alert("❌ Invalid email format.");
    return;
  }

  // Decide mode:
  const looksLikeHash = isHex64(link);
  const checkMode = looksLikeHash && !address && !email;

  try{
    busy(btn, true);

    if (checkMode){
      // --------- CHECK MODE ----------
      // Try GET /order/<hash>, fallback to POST /save-order with {hash}
      let res, ok=false, data;

      try{
        res = await fetch(`/order/${link.toLowerCase()}`, { method: 'GET' });
        ok = res.ok;
        if (ok) data = await res.json();
      }catch(_){/* ignore and fallback */}

      if (!ok){
        const res2 = await fetch('/save-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hash: link.toLowerCase() })
        });
        if (!res2.ok) throw new Error(await res2.text() || 'Order not found');
        data = await res2.json();
      }

      // Map flexible keys
      setText('timestamp', data.timestamp || data.time || '—');
      setText('hash',      data.order_hash || data.hash || link.toLowerCase());
      setText('status',    data.status || '—');
      setText('email',     data.email || '—');

      const payAddr = data.payment_address || data.address || '';
      if ((data.status || '').toLowerCase() === 'waiting_payment' && (data.order_hash || data.hash)){
        $('address').innerHTML = `<a href="/pay/${(data.order_hash||data.hash)}" target="_blank" rel="noopener">Pay Now</a>`;
      } else {
        setText('address', payAddr || '—');
      }

      showResult();
      return;
    }

    // --------- SUBMIT MODE ----------
    const { hash, timestamp } = await generateHash(link);

    // optimistic UI
    setText('timestamp', timestamp);
    setText('hash', hash);
    setText('status', 'pending');
    setText('address', 'not_assigned');
    setText('email', email || '—');
    showResult();

    const res = await fetch('/save-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link, address, email, timestamp, hash })
    });

    if (!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error(t || ('HTTP ' + res.status));
    }

    const saved = await res.json().catch(()=> ({}));
    // If backend returns canonical values, update UI
    setText('status',  saved.status || 'pending');
    setText('address', saved.payment_address || saved.address || 'not_assigned');
    setText('email',   saved.email || email || '—');

    alert("✅ Order submitted. You’ll receive an accepted/rejected status soon.");

  }catch(err){
    setText('status', 'Error: ' + (err.message || 'Unknown'));
    showResult();
    if ((err.message||'').includes('Too many')){
      alert("🚫 Too many submissions. Please wait a minute and try again.");
    }else{
      alert('❌ Could not complete the request: ' + (err.message || 'Unknown error'));
    }
  }finally{
    busy(btn, false);
  }
}

// ---------- Inline help ----------
function showHelp(type){
  const msgs = {
    link: "🔗 Paste a direct product URL from a store, or an existing order hash to check status.",
    address: "📦 Prefer pickup points. If using a full address, include country/city/state and any precise instructions. This field is encrypted in your browser before sending.",
    email: "📧 Optional. Use a privacy-friendly email. We never send your address by email."
  };
  alert(msgs[type] || 'Help not available.');
}
