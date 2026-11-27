(function () {
  'use strict';
  var S = window.Subtitles;
  var $ = function (id) { return document.getElementById(id); };
  var state = { cues: [], original: [], format: 'srt', name: 'subtitles' };

  function readFile(file, cb) {
    var fr = new FileReader();
    fr.onload = function () { cb(new Uint8Array(fr.result)); };
    fr.onerror = function () { setStatus('Could not read the file.'); };
    fr.readAsArrayBuffer(file);
  }

  function decodeSel(bytes) {
    var r = S.decodeBytes(bytes, $('encoding').value);
    return r;
  }

  function setStatus(msg) { $('status').textContent = msg; }

  function list(id, items, okMsg) {
    var ul = $(id);
    ul.innerHTML = '';
    if (!items.length && okMsg) {
      var ok = document.createElement('li');
      ok.className = 'ok';
      ok.textContent = okMsg;
      ul.appendChild(ok);
    }
    items.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function render() {
    $('output').value = S.serialize(state.cues, $('format').value);
  }

  function load(text) {
    var r = S.parse(text);
    state.cues = r.cues;
    state.original = r.cues.map(function (c) { return { start: c.start, end: c.end, text: c.text, settings: c.settings }; });
    state.format = r.format;
    $('format').value = r.format === 'vtt' ? 'vtt' : 'srt';
    list('errors', r.errors.map(function (e) { return 'Line ' + e.line + ': ' + e.message; }));
    list('report', []);
    setStatus(r.cues.length + ' cues loaded (' + r.format.toUpperCase() + (r.format === 'ass' ? ', styling and positions dropped' : '') + ')' +
      (r.errors.length ? ', ' + r.errors.length + ' problem(s) skipped or flagged below.' : '.'));
    render();
  }

  function num(id) { return parseFloat($(id).value); }

  function requireCues() {
    if (!state.cues.length) { setStatus('Load some subtitles first.'); return false; }
    return true;
  }

  function apply(fn) {
    if (!requireCues()) return;
    try { fn(); render(); } catch (e) { setStatus(e.message); }
  }

  function shift(sign) {
    apply(function () {
      var ms = num('shiftMs');
      if (!isFinite(ms)) throw new Error('Enter a number of milliseconds.');
      var r = S.shift(state.cues, sign * ms);
      state.cues = r.cues;
      setStatus('Shifted by ' + (sign * ms) + ' ms.' + (r.dropped ? ' ' + r.dropped + ' cue(s) fell before 00:00 and were removed.' : ''));
    });
  }

  $('file').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    state.name = f.name.replace(/\.[^.]+$/, '') || 'subtitles';
    readFile(f, function (bytes) {
      state.bytes = bytes;
      var r = decodeSel(bytes);
      $('input').value = r.text;
      load(r.text);
      setStatus(($('encoding').value === 'auto' ? 'Detected ' : 'Using ') + r.encoding.toUpperCase() + '. ' + $('status').textContent);
    });
  });
  S.ENCODINGS.forEach(function (e) {
    var o = document.createElement('option');
    o.value = e[0]; o.textContent = e[1];
    $('encoding').appendChild(o);
  });
  $('encoding').addEventListener('change', function () {
    if (!state.bytes) { setStatus('Encoding applies to files you choose. Pasted text is already decoded.'); return; }
    var r = decodeSel(state.bytes);
    $('input').value = r.text;
    load(r.text);
    setStatus('Using ' + r.encoding.toUpperCase() + '. ' + $('status').textContent);
  });
  $('load').addEventListener('click', function () { state.bytes = null; load($('input').value); });
  $('reset').addEventListener('click', function () {
    state.cues = state.original.map(function (c) { return { start: c.start, end: c.end, text: c.text, settings: c.settings }; });
    list('report', []);
    setStatus('Reset to the originally loaded cues.');
    render();
  });
  $('shiftLater').addEventListener('click', function () { shift(1); });
  $('shiftEarlier').addEventListener('click', function () { shift(-1); });
  $('fpsApply').addEventListener('click', function () {
    apply(function () {
      state.cues = S.scaleFps(state.cues, num('fpsFrom'), num('fpsTo'));
      setStatus('Timings scaled from ' + num('fpsFrom') + ' to ' + num('fpsTo') + ' fps.');
    });
  });
  $('syncApply').addEventListener('click', function () {
    apply(function () {
      var t = ['syncA1', 'syncB1', 'syncA2', 'syncB2'].map(function (id) { return S.parseTimeInput($(id).value); });
      if (t.some(isNaN)) throw new Error('Enter all four times as HH:MM:SS,mmm (or seconds).');
      var r = S.linearSync(state.cues, t[0], t[1], t[2], t[3]);
      state.cues = r.cues;
      setStatus('Two-point sync applied (speed factor ' + r.factor.toFixed(6) + ').' + (r.dropped ? ' ' + r.dropped + ' cue(s) fell before 00:00 and were removed.' : ''));
    });
  });
  $('overlapApply').addEventListener('click', function () {
    apply(function () {
      var r = S.fixOverlaps(state.cues, num('gapMs') || 0);
      state.cues = r.cues;
      setStatus('Sorted by start time. ' + r.fixed + ' overlap(s) fixed.');
    });
  });
  $('check').addEventListener('click', function () {
    if (!requireCues()) return;
    var issues = S.analyze(state.cues, { maxChars: num('maxChars'), maxCps: num('maxCps') });
    list('report', issues.map(function (i) {
      return 'Cue ' + i.index + ' (' + S.formatTime(i.start, '.') + '): ' + i.message;
    }), 'No problems found.');
    setStatus(issues.length + ' issue(s) found.');
  });
  $('file2').addEventListener('change', function () {
    var f = $('file2').files[0];
    if (!f) return;
    if (!requireCues()) { $('file2').value = ''; return; }
    readFile(f, function (bytes) {
      var r = S.parse(decodeSel(bytes).text);
      state.second = r;
      setStatus('Second file loaded: ' + r.cues.length + ' cues' + (r.errors.length ? ', ' + r.errors.length + ' problem(s) (first at line ' + r.errors[0].line + ')' : '') + '. Press Merge.');
    });
  });
  $('mergeApply').addEventListener('click', function () {
    apply(function () {
      if (!state.second) throw new Error('Choose a second file first.');
      state.cues = S.merge(state.cues, state.second.cues, num('mergeOffset') || 0);
      setStatus('Merged. Now ' + state.cues.length + ' cues.');
      state.second = null;
      $('file2').value = '';
    });
  });
  $('format').addEventListener('change', render);

  $('download').addEventListener('click', function () {
    if (!requireCues()) return;
    var fmt = $('format').value;
    var blob = new Blob([(fmt === 'vtt' ? '' : '') + S.serialize(state.cues, fmt)], { type: fmt === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.name + '.' + fmt;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('copy').addEventListener('click', function () {
    var t = $('output').value;
    if (!t) return;
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { setStatus('Copied.'); }, function () { setStatus('Copy failed; select the text manually.'); });
    else { $('output').select(); setStatus('Press Ctrl+C to copy.'); }
  });
})();
