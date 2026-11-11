/* vendored from octopus-kit v0.6.0 ui/dialog.js | sha256:4a375ff587145bf712a846e85e3627bef17a7e8adcb7182999de4cc2506ae006 | DO NOT EDIT: node tools/kit-sync.mjs */
/*! octopus-kit ui/dialog.js: themed alert / confirm / prompt / toast. Zero dependencies.
 *
 * One file, three ways to load it:
 *   - classic <script src="dialog.js">  -> window.oDialog
 *   - ES import / bundlers (Vite, Next) -> import { confirm, toast } from 'octopus-kit/ui/dialog.js'
 *     (the package is CommonJS, so bundlers and Node read the `exports.x` lines below as named exports,
 *      and `import oDialog from ...` gives the whole object)
 *   - require()                         -> the same object
 * Styling: ui/dialog.css. Docs: docs/dialog.md.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
    exports.alert = api.alert;
    exports.confirm = api.confirm;
    exports.prompt = api.prompt;
    exports.toast = api.toast;
  }
  if (typeof window !== 'undefined') window.oDialog = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';

  var doc = typeof document !== 'undefined' ? document : null;
  var uid = 0;
  var chain = Promise.resolve();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Resolves once document.body exists. Never rejects.
  function ready() {
    if (!doc) return Promise.resolve(false);
    if (doc.body) return Promise.resolve(true);
    return new Promise(function (res) {
      doc.addEventListener('DOMContentLoaded', function () { res(!!doc.body); }, { once: true });
    });
  }

  // Calls run strictly one after another, so two dialogs never stack.
  function enqueue(task, fallback) {
    var run = chain.then(function () {
      return ready().then(function (ok) { return ok ? task() : fallback; });
    }).catch(function () { return fallback; });
    chain = run.then(function () {}, function () {});
    return run;
  }

  function norm(o) { return typeof o === 'string' ? { body: o } : (o || {}); }

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function setBody(node, text, html) {
    if (html) node.innerHTML = text; else node.textContent = text;
  }

  function focusables(dlg) {
    return Array.prototype.filter.call(
      dlg.querySelectorAll('button, input, textarea, select, a[href], [tabindex]'),
      function (n) { return !n.disabled && n.tabIndex !== -1 && n.type !== 'hidden'; }
    );
  }

  /**
   * kind: 'alert' | 'confirm' | 'prompt'. Resolves with { ok, value }.
   */
  function open(kind, o) {
    return new Promise(function (resolve) {
      var id = 'o-dialog-' + (++uid);
      var opener = doc.activeElement;
      var dlg = el('dialog', 'o-modal o-dialog o-dialog--' + kind + (o.danger ? ' o-dialog--danger' : ''));
      dlg.setAttribute('aria-labelledby', id + '-t');
      var form = el('form', 'o-dialog__form');
      form.setAttribute('novalidate', '');
      form.method = 'dialog';

      var title = el('h2', 'o-modal__title o-dialog__title', o.title || (kind === 'alert' ? 'Notice' : kind === 'confirm' ? 'Are you sure?' : (o.label || 'Enter a value')));
      title.id = id + '-t';
      form.appendChild(title);

      if (o.body != null && o.body !== '') {
        var body = el('div', 'o-dialog__body');
        body.id = id + '-b';
        setBody(body, String(o.body), o.html === true);
        dlg.setAttribute('aria-describedby', id + '-b');
        form.appendChild(body);
      }

      var input = null, tInput = null, err = null;
      if (kind === 'prompt') {
        var lab = el('label', 'o-dialog__label', o.label || '');
        lab.htmlFor = id + '-i';
        input = el('input', 'o-input o-dialog__input');
        input.id = id + '-i';
        input.type = o.inputType || 'text';
        input.value = o.value == null ? '' : String(o.value);
        if (o.placeholder) input.placeholder = o.placeholder;
        input.setAttribute('autocomplete', o.autoComplete || 'off');
        if (o.inputMode) input.setAttribute('inputmode', o.inputMode);
        if (o.required) input.required = true;
        if (o.label) form.appendChild(lab); else input.setAttribute('aria-labelledby', id + '-t');
        form.appendChild(input);
        err = el('p', 'o-dialog__error');
        err.hidden = true;
        err.setAttribute('role', 'alert');
        form.appendChild(err);
      }
      if (kind === 'confirm' && o.typeToConfirm) {
        var want = String(o.typeToConfirm);
        var tl = el('label', 'o-dialog__label');
        tl.htmlFor = id + '-c';
        tl.appendChild(doc.createTextNode('Type '));
        tl.appendChild(el('strong', 'o-dialog__token', want));
        tl.appendChild(doc.createTextNode(' to confirm'));
        tInput = el('input', 'o-input o-dialog__input');
        tInput.id = id + '-c';
        tInput.type = 'text';
        tInput.setAttribute('autocomplete', 'off');
        tInput.setAttribute('autocapitalize', 'off');
        tInput.setAttribute('spellcheck', 'false');
        form.appendChild(tl);
        form.appendChild(tInput);
      }

      var actions = el('div', 'o-modal__actions o-dialog__actions');
      var cancelBtn = null;
      if (kind !== 'alert') {
        cancelBtn = el('button', 'o-btn o-dialog__btn o-dialog__cancel', o.cancelLabel || 'Cancel');
        cancelBtn.type = 'button';
        actions.appendChild(cancelBtn);
      }
      var okBtn = el('button', 'o-btn o-dialog__btn o-dialog__ok ' + (o.danger ? 'o-btn--danger' : 'o-btn--primary'), o.confirmLabel || 'OK');
      okBtn.type = 'submit';
      actions.appendChild(okBtn);
      form.appendChild(actions);
      dlg.appendChild(form);

      if (tInput) {
        okBtn.disabled = true;
        tInput.addEventListener('input', function () { okBtn.disabled = tInput.value.trim() !== want; });
      }

      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        var value = null;
        if (kind === 'prompt') value = ok ? input.value : null;
        try { if (dlg.open && dlg.close) dlg.close(); } catch (e) { /* already closed */ }
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        doc.removeEventListener('keydown', onKey, true);
        try { if (opener && opener.focus && doc.contains(opener)) opener.focus(); } catch (e) { /* gone */ }
        resolve({ ok: ok, value: value });
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (okBtn.disabled) return;
        if (kind === 'prompt' && o.required && !input.value.trim()) {
          err.textContent = 'This field is required.';
          err.hidden = false;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        finish(true);
      });
      if (cancelBtn) cancelBtn.addEventListener('click', function () { finish(false); });
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); finish(kind === 'alert'); });
      dlg.addEventListener('close', function () { finish(false); });
      // A click on the dim area (the <dialog> itself, outside its form) dismisses, except a prompt (keeps typing safe).
      dlg.addEventListener('mousedown', function (e) {
        if (e.target === dlg && kind !== 'prompt') {
          var r = form.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) finish(kind === 'alert');
        }
      });

      // Esc, Enter and the focus trap, in the capture phase so they also work in the no-showModal fallback.
      function onKey(e) {
        if (!dlg.parentNode) return;
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation();
          finish(kind === 'alert');
        } else if (e.key === 'Enter') {
          var t = e.target;
          // Buttons and fields do their own thing natively (a field's Enter submits the form).
          if (t && dlg.contains(t) && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
          e.preventDefault();
          if (typeof form.requestSubmit === 'function') form.requestSubmit(); else if (!okBtn.disabled) finish(true);
        } else if (e.key === 'Tab') {
          var f = focusables(dlg);
          if (!f.length) { e.preventDefault(); return; }
          var first = f[0], last = f[f.length - 1], a = doc.activeElement;
          if (!dlg.contains(a)) { e.preventDefault(); first.focus(); }
          else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
        }
      }
      doc.addEventListener('keydown', onKey, true);

      doc.body.appendChild(dlg);
      if (typeof dlg.showModal === 'function') {
        try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); dlg.classList.add('o-dialog--fallback'); }
      } else {
        dlg.setAttribute('open', '');
        dlg.setAttribute('role', 'dialog');
        dlg.setAttribute('aria-modal', 'true');
        dlg.classList.add('o-dialog--fallback');
      }
      // Initial focus: the field if there is one; a danger confirm starts on Cancel so a stray Enter is safe.
      var target = tInput || input || (o.danger && cancelBtn) || okBtn;
      try { target.focus(); if (input && input.select && !tInput) input.select(); } catch (e) { /* ignore */ }
    });
  }

  function alertFn(o) {
    o = norm(o);
    return enqueue(function () { return open('alert', o).then(function () {}); }, undefined);
  }
  function confirmFn(o) {
    o = norm(o);
    return enqueue(function () { return open('confirm', o).then(function (r) { return r.ok; }); }, false);
  }
  function promptFn(o) {
    o = norm(o);
    if (o.label == null && o.body != null) { o = Object.assign({}, o); o.label = o.body; delete o.body; }
    return enqueue(function () { return open('prompt', o).then(function (r) { return r.ok ? r.value : null; }); }, null);
  }

  var region = null;
  function toast(message, opts) {
    try {
      opts = opts || {};
      var kind = opts.kind || 'info';
      var timeout = opts.timeout == null ? 4000 : opts.timeout;
      ready().then(function (ok) {
        if (!ok) return;
        if (!region || !region.parentNode) {
          region = el('div', 'o-toast-region o-dialog-toasts');
          region.setAttribute('role', 'status');
          region.setAttribute('aria-live', 'polite');
          region.setAttribute('aria-atomic', 'false');
          doc.body.appendChild(region);
        }
        var t = el('div', 'o-toast o-dialog-toast o-toast--' + kind);
        t.appendChild(el('span', 'o-dialog-toast__msg', message == null ? '' : String(message)));
        var x = el('button', 'o-dialog-toast__close', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Dismiss');
        var timer = null;
        function remove() {
          if (timer) clearTimeout(timer);
          if (t.parentNode) t.parentNode.removeChild(t);
        }
        x.addEventListener('click', remove);
        t.appendChild(x);
        while (region.children.length >= 5) region.removeChild(region.firstChild);
        region.appendChild(t);
        if (timeout > 0 && isFinite(timeout)) timer = setTimeout(remove, timeout);
      });
    } catch (e) { /* a toast must never break the caller */ }
  }

  return {
    alert: alertFn,
    confirm: confirmFn,
    prompt: promptFn,
    toast: toast,
    _test: { esc: esc }
  };
});
