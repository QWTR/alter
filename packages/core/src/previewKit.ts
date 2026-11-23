// Script injected into previewed pages (only does something inside ALTTER's preview frame):
//  - live build: the page as the AI types it is morphed into the DOM, new elements animate in, the one being written glows
//  - element picking: hover outline + click to send an element (selector, text, HTML) to the chat
// It only listens to its parent window (the ALTTER chat); the frame itself is sandboxed without same-origin.
export const PREVIEW_KIT = String.raw`(function () {
  if (window.parent === window || window.__alterKit) return;
  window.__alterKit = true;
  var KIT = 'data-alter-kit';
  var ACC = '#8b6cff';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var layer = document.createElement('div');
  layer.setAttribute(KIT, '');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:600 11px/1.2 system-ui,sans-serif;';
  function mount() { if (!layer.isConnected) document.documentElement.appendChild(layer); }
  function post(m) { m.alter = 1; parent.postMessage(m, '*'); }
  function isKit(n) { return n.nodeType === 1 && n.hasAttribute(KIT); }
  function el(css) { var d = document.createElement('div'); d.style.cssText = 'position:fixed;box-sizing:border-box;' + css; layer.appendChild(d); return d; }
  function place(b, r, pad) { pad = pad || 0; b.style.left = (r.left - pad) + 'px'; b.style.top = (r.top - pad) + 'px'; b.style.width = (r.width + pad * 2) + 'px'; b.style.height = (r.height + pad * 2) + 'px'; }

  // ---------- live build ----------
  var added = [], touched = null, writing = null, follow = true, userScroll = 0, building = false;
  addEventListener('wheel', function () { userScroll = Date.now(); }, { passive: true });
  addEventListener('touchmove', function () { userScroll = Date.now(); }, { passive: true });
  function same(a, b) { return a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName); }
  function attrs(o, n) {
    for (var i = o.attributes.length - 1; i >= 0; i--) { var a = o.attributes[i]; if (!n.hasAttribute(a.name)) o.removeAttribute(a.name); }
    for (var j = 0; j < n.attributes.length; j++) { var b = n.attributes[j]; if (o.getAttribute(b.name) !== b.value) o.setAttribute(b.name, b.value); }
  }
  function morph(o, n, anim) {
    var oc = [], nc = n.childNodes, i;
    for (i = 0; i < o.childNodes.length; i++) if (!isKit(o.childNodes[i])) oc.push(o.childNodes[i]);
    for (i = 0; i < nc.length; i++) {
      var a = oc[i], b = nc[i];
      if (!a || !same(a, b)) {
        var c = document.importNode(b, true);
        if (a) o.replaceChild(c, a); else o.appendChild(c);
        if (anim) { if (c.nodeType === 1) { added.push(c); touched = c; } else if (c.nodeType === 3 && c.nodeValue.trim()) touched = o; }
        continue;
      }
      if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) { a.nodeValue = b.nodeValue; if (anim) touched = o; } continue; }
      if (a.tagName === 'SCRIPT') continue;
      attrs(a, b);
      morph(a, b, anim);
    }
    for (i = nc.length; i < oc.length; i++) if (oc[i].parentNode === o) o.removeChild(oc[i]);
  }
  function flash(t, delay) {
    var r = t.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
    var b = el('border:1.5px solid ' + ACC + ';border-radius:8px;box-shadow:0 0 0 4px rgba(139,108,255,.14),0 0 28px rgba(139,108,255,.35);opacity:0;');
    place(b, r, 2);
    b.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 1100, delay: delay, easing: 'ease-out' }).onfinish = function () { b.remove(); };
  }
  function animateIn(list) {
    if (reduce) return;
    var n = 0;
    for (var i = 0; i < list.length && n < 36; i++) {
      var t = list[i], skip = false;
      for (var p = t.parentElement; p; p = p.parentElement) if (list.indexOf(p) >= 0) { skip = true; break; }
      if (skip || !t.animate) continue;
      var d = Math.min(n * 45, 500);
      t.animate([{ opacity: 0, transform: 'translateY(14px) scale(.98)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 620, delay: d, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      flash(t, d);
      n++;
    }
  }
  function lastLeaf(root) {
    var e = root;
    while (e && e.lastElementChild && !isKit(e.lastElementChild)) e = e.lastElementChild;
    return e;
  }
  // scripts do not run while the page is being typed, so scroll-reveal content (opacity 0 until JS adds a class) is shown by force
  function unhide() {
    var all = document.body.getElementsByTagName('*');
    for (var i = 0; i < all.length && i < 3000; i++) {
      var e = all[i];
      if (isKit(e) || (e.getAnimations && e.getAnimations().length)) continue;
      var cs = getComputedStyle(e);
      if (cs.opacity === '0' || cs.visibility === 'hidden') {
        e.style.setProperty('opacity', '1', 'important');
        e.style.setProperty('visibility', 'visible', 'important');
        e.style.setProperty('transform', 'none', 'important');
      }
    }
  }
  var parser = new DOMParser();
  function render(html, done) {
    var doc = parser.parseFromString(html, 'text/html');
    var s = doc.querySelectorAll('script');
    for (var i = 0; i < s.length; i++) s[i].remove();
    attrs(document.documentElement, doc.documentElement);
    added = []; touched = null;
    morph(document.head, doc.head, false);
    attrs(document.body, doc.body);
    morph(document.body, doc.body, true);
    mount();
    unhide();
    animateIn(added);
    building = !done;
    writing = done ? null : (touched && touched !== document.body ? touched : lastLeaf(document.body));
    if (writing && follow && Date.now() - userScroll > 2500) {
      var r = writing.getBoundingClientRect();
      if (r.bottom > innerHeight - 40 || r.top < 0) writing.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
    kick();
  }
  function css(name, text) {
    var links = document.querySelectorAll('link[rel~=stylesheet]'), host = null;
    for (var i = 0; i < links.length; i++) { var h = (links[i].getAttribute('href') || '').split(/[?#]/)[0]; if (h === name || h.slice(-name.length - 1) === '/' + name) host = links[i]; }
    var st = document.querySelector('style[data-alter-css="' + name + '"]');
    if (!st) { st = document.createElement('style'); st.setAttribute(KIT, ''); st.setAttribute('data-alter-css', name); (host && host.parentNode ? host.parentNode.insertBefore(st, host.nextSibling) : document.head.appendChild(st)); }
    if (host) host.disabled = true;
    st.textContent = text;
  }

  // ---------- picking ----------
  var picking = false, hover = null, picks = [], seq = 0;
  function label(e) {
    var s = e.tagName.toLowerCase();
    if (e.id) s += '#' + e.id;
    var c = (e.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (c.length) s += '.' + c.join('.');
    return s;
  }
  function selector(e) {
    var parts = [];
    for (; e && e.nodeType === 1 && e !== document.documentElement && parts.length < 5; e = e.parentElement) {
      if (e.id) { parts.unshift('#' + CSS.escape(e.id)); break; }
      var t = e.tagName.toLowerCase();
      if (e === document.body) { parts.unshift(t); break; }
      var c = (e.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
      if (c) t += '.' + CSS.escape(c);
      var p = e.parentElement;
      if (p) { var sib = [], k; for (k = 0; k < p.children.length; k++) if (p.children[k].tagName === e.tagName) sib.push(p.children[k]); if (sib.length > 1) t += ':nth-of-type(' + (sib.indexOf(e) + 1) + ')'; }
      parts.unshift(t);
    }
    return parts.join(' > ');
  }
  function snippet(e) {
    var h = e.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg>…</svg>').replace(/\s+/g, ' ');
    return h.length > 900 ? h.slice(0, 900) + '…' : h;
  }
  var hoverBox = el('display:none;border:2px solid ' + ACC + ';background:rgba(139,108,255,.10);border-radius:6px;transition:all .08s ease-out;');
  var hoverTag = el('display:none;padding:3px 7px;border-radius:6px;background:' + ACC + ';color:#fff;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.25);');
  function target(ev) { var t = ev.target; return t && t.nodeType === 1 && !isKit(t) && t !== document.documentElement ? t : null; }
  function stop(ev) { if (!picking) return; ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); }
  ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'submit', 'dblclick', 'contextmenu'].forEach(function (n) { addEventListener(n, stop, true); });
  addEventListener('mousemove', function (ev) { if (!picking) return; hover = target(ev); kick(); }, true);
  addEventListener('mouseleave', function () { hover = null; kick(); }, true);
  addEventListener('click', function (ev) {
    if (!picking) return;
    stop(ev);
    var t = target(ev);
    if (!t) return;
    for (var i = 0; i < picks.length; i++) if (picks[i].el === t) { post({ t: 'unpicked', id: picks[i].id }); drop(picks[i].id); return; }
    var id = 'p' + (++seq);
    var box = el('border:2px solid ' + ACC + ';border-radius:6px;background:rgba(139,108,255,.08);');
    var tag = el('min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:' + ACC + ';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);');
    picks.push({ id: id, el: t, box: box, tag: tag });
    if (!reduce) box.animate([{ transform: 'scale(1.06)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    var txt = (t.innerText || t.getAttribute('alt') || t.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    post({ t: 'picked', id: id, selector: selector(t), label: label(t), text: txt.slice(0, 140), html: snippet(t) });
    kick();
  }, true);
  addEventListener('keydown', function (ev) { if (picking && ev.key === 'Escape') { setPicking(false); post({ t: 'pickOff' }); } }, true);
  function drop(id) { picks = picks.filter(function (p) { if (p.id === id) { p.box.remove(); p.tag.remove(); return false; } return true; }); kick(); }
  function setPicking(on) {
    picking = on;
    document.documentElement.style.cursor = on ? 'crosshair' : '';
    if (!on) hover = null;
    kick();
  }

  // ---------- online session: my pointer out, other people's cursors + picks in ----------
  var lastPtr = 0, remote = [], remoteEls = {};
  addEventListener('mousemove', function (ev) {
    var now = Date.now();
    if (now - lastPtr < 45) return;
    lastPtr = now;
    var t = target(ev);
    if (!t) return;
    var r = t.getBoundingClientRect();
    post({ t: 'pointer', sel: selector(t), fx: r.width ? (ev.clientX - r.left) / r.width : 0, fy: r.height ? (ev.clientY - r.top) / r.height : 0 });
  }, true);
  document.addEventListener('mouseleave', function () { post({ t: 'pointer', sel: null }); });
  addEventListener('scroll', function () { kick(); }, true);
  function find(sel) { try { return sel ? document.querySelector(sel) : null; } catch (e) { return null; } }
  function remoteFor(p) {
    var r = remoteEls[p.cid];
    if (!r) {
      r = remoteEls[p.cid] = { cur: el('display:none;left:0;top:0;transition:transform .12s linear;will-change:transform;'), boxes: [] };
      r.cur.innerHTML = '<svg width="18" height="20" viewBox="0 0 18 20" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M1 1l15 8.2-6.7 1.6L6 18z" fill="' + p.color + '" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="position:absolute;left:14px;top:16px;padding:2px 7px;border-radius:6px;background:' + p.color + ';color:#fff;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.25)"></span>';
    }
    r.cur.lastChild.textContent = p.name;
    return r;
  }
  function setRemote(list) {
    remote = list || [];
    var keep = {};
    remote.forEach(function (p) { keep[p.cid] = 1; });
    Object.keys(remoteEls).forEach(function (cid) {
      if (keep[cid]) return;
      remoteEls[cid].cur.remove(); remoteEls[cid].boxes.forEach(function (b) { b.remove(); }); delete remoteEls[cid];
    });
    kick();
  }
  function drawRemote() {
    var any = false;
    remote.forEach(function (p) {
      var r = remoteFor(p), t = p.cursor && find(p.cursor.sel);
      if (t) {
        var q = t.getBoundingClientRect();
        var x = Math.min(Math.max(q.left + q.width * (p.cursor.fx || 0), 4), innerWidth - 90);
        var y = q.top + q.height * (p.cursor.fy || 0);
        // somewhere else on the page: pinned to the edge with an arrow, so you know where they are
        var off = y < 0 ? '↑ ' : y > innerHeight - 10 ? '↓ ' : '';
        if (off) y = y < 0 ? 4 : innerHeight - 40;
        r.cur.lastChild.textContent = off + p.name;
        r.cur.style.opacity = off ? '0.75' : '1';
        r.cur.style.display = 'block';
        r.cur.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        any = true;
      } else r.cur.style.display = 'none';
      var sels = p.picks || [];
      while (r.boxes.length > sels.length) r.boxes.pop().remove();
      sels.forEach(function (sel, i) {
        var b = r.boxes[i];
        if (!b) { b = r.boxes[i] = el('border:2px dashed ' + p.color + ';border-radius:6px;background:' + p.color + '14;'); b.appendChild(document.createElement('span')).style.cssText = 'position:absolute;left:-2px;top:-20px;padding:2px 6px;border-radius:5px;background:' + p.color + ';color:#fff;white-space:nowrap;'; }
        var e = find(sel);
        if (!e) { b.style.display = 'none'; return; }
        b.style.display = 'block'; place(b, e.getBoundingClientRect()); b.firstChild.textContent = p.name + ' · ' + (i + 1);
        any = true;
      });
    });
    return any;
  }

  // ---------- overlay loop ----------
  var writeBox = el('display:none;border:1.5px dashed ' + ACC + ';border-radius:8px;box-shadow:0 0 0 4px rgba(139,108,255,.12),0 0 30px rgba(139,108,255,.3);');
  var writeTag = el('display:none;padding:3px 8px;border-radius:999px;background:' + ACC + ';color:#fff;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.3);');
  var writeLabel = 'ALTTER';
  if (!reduce) writeBox.animate([{ opacity: 0.55 }, { opacity: 1 }, { opacity: 0.55 }], { duration: 1400, iterations: Infinity });
  var raf = 0;
  function kick() { mount(); if (!raf) raf = requestAnimationFrame(frame); }
  function tagAt(t, r) { t.style.left = Math.max(4, r.left) + 'px'; t.style.top = (r.top > 26 ? r.top - 24 : r.top + 4) + 'px'; }
  function frame() {
    raf = 0;
    var live = false;
    if (building && writing && writing.isConnected) {
      var r = writing.getBoundingClientRect();
      writeBox.style.display = writeTag.style.display = r.width ? 'block' : 'none';
      place(writeBox, r, 4); tagAt(writeTag, { left: r.left - 4, top: r.top - 4 });
      writeTag.textContent = '✎ ' + writeLabel;
      live = true;
    } else writeBox.style.display = writeTag.style.display = 'none';
    if (picking && hover) {
      var h = hover.getBoundingClientRect();
      hoverBox.style.display = hoverTag.style.display = 'block';
      place(hoverBox, h); tagAt(hoverTag, h);
      hoverTag.textContent = label(hover) + '  ' + Math.round(h.width) + '×' + Math.round(h.height);
    } else hoverBox.style.display = hoverTag.style.display = 'none';
    picks.forEach(function (p, i) {
      if (!p.el.isConnected) { p.box.style.display = p.tag.style.display = 'none'; return; }
      var q = p.el.getBoundingClientRect();
      p.box.style.display = 'block'; p.tag.style.display = 'flex';
      place(p.box, q); p.tag.style.left = (q.right - 10) + 'px'; p.tag.style.top = (q.top - 9) + 'px';
      p.tag.textContent = String(i + 1);
    });
    var others = drawRemote();
    if (live || picks.length || (picking && hover) || others) raf = requestAnimationFrame(frame);
  }

  addEventListener('message', function (ev) {
    if (ev.source !== parent) return;
    var m = ev.data || {};
    if (m.t === 'draft' && typeof m.html === 'string') { if (m.label) writeLabel = m.label; render(m.html, !!m.done); }
    else if (m.t === 'css' && typeof m.css === 'string') css(m.name, m.css);
    else if (m.t === 'building') { building = !!m.on; if (!building) writing = null; kick(); }
    else if (m.t === 'pick') setPicking(!!m.on);
    else if (m.t === 'unpick') drop(m.id);
    else if (m.t === 'remote') setRemote(m.list);
    else if (m.t === 'clearPicks') picks.slice().forEach(function (p) { drop(p.id); });
  });
  post({ t: 'ready' });
})();`;
