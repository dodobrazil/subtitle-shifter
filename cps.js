(function () {
  'use strict';
  var S = window.Subtitles;
  var $ = function (id) { return document.getElementById(id); };
  var name = 'subtitles';
  var result = null;
  var LABEL = { cps: 'Too fast (CPS)', cpl: 'Line too long (CPL)', short: 'Too short', long: 'Too long', lines: 'Too many lines' };

  function limits() {
    return { cps: parseFloat($('cps').value), cpl: parseFloat($('cpl').value), minMs: parseFloat($('minDur').value) * 1000, maxMs: parseFloat($('maxDur').value) * 1000, maxLines: parseFloat($('maxLines').value) };
  }

  function csvCell(v) { v = String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  function run() {
    var text = $('input').value;
    $('rows').innerHTML = '';
    result = null;
    if (!text.trim()) { $('status').textContent = 'Load or paste a subtitle file first.'; return; }
    var p = S.parse(text);
    result = S.analyzeReadingSpeed(p.cues, limits());
    var only = $('onlyIssues').checked;
    result.rows.forEach(function (r) {
      if (only && !r.issues.length) return;
      var tr = document.createElement('tr');
      if (r.issues.length) tr.className = 'bad';
      [r.index, S.formatTime(r.start), (r.durationMs / 1000).toFixed(2), r.chars, isFinite(r.cps) ? r.cps : 'inf', r.maxLineLen,
       r.issues.map(function (c) { return LABEL[c]; }).join(', '), r.text].forEach(function (v) {
        var td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      $('rows').appendChild(tr);
    });
    $('status').textContent = result.total + ' cues checked, ' + result.violations + ' with at least one issue.' +
      (p.errors.length ? ' ' + p.errors.length + ' problem(s) skipped while parsing.' : '');
  }

  function csv() {
    run();
    if (!result) return;
    var out = ['index,start,end,duration_s,chars,cps,max_line_len,lines,issues,text'];
    result.rows.forEach(function (r) {
      out.push([r.index, S.formatTime(r.start), S.formatTime(r.end), (r.durationMs / 1000).toFixed(3), r.chars, isFinite(r.cps) ? r.cps : '', r.maxLineLen, r.lines, r.issues.join('|'), r.text].map(csvCell).join(','));
    });
    var blob = new Blob([out.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.reading-speed.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  $('file').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    name = f.name.replace(/\.[^.]+$/, '') || 'subtitles';
    var fr = new FileReader();
    fr.onload = function () { $('input').value = S.decodeBytes(new Uint8Array(fr.result), $('encoding').value).text; run(); };
    fr.readAsArrayBuffer(f);
  });
  $('apply').addEventListener('click', run);
  $('dl').addEventListener('click', csv);
  $('onlyIssues').addEventListener('change', function () { if ($('input').value.trim()) run(); });
  S.ENCODINGS.forEach(function (e) {
    var o = document.createElement('option');
    o.value = e[0]; o.textContent = e[1];
    $('encoding').appendChild(o);
  });
})();
