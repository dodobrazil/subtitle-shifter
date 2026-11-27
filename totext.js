(function () {
  'use strict';
  var S = window.Subtitles;
  var $ = function (id) { return document.getElementById(id); };
  var name = 'subtitles';

  function run() {
    var text = $('input').value;
    if (!text.trim()) { $('status').textContent = 'Paste subtitles or choose a file.'; $('output').value = ''; return; }
    var p = S.parse(text);
    var gap = parseFloat($('gap').value);
    var r = S.toText(p.cues, {
      mode: $('mode').value, gapMs: isNaN(gap) ? 2000 : Math.max(0, gap) * 1000,
      timestamps: $('timestamps').checked, stripTags: $('tags').checked, dedupe: $('dedupe').checked
    });
    $('output').value = r.text;
    $('status').textContent = r.count + ' text cues extracted from ' + p.format.toUpperCase() + '.' +
      (p.errors.length ? ' ' + p.errors.length + ' problem(s) skipped.' : '') + (p.format === 'ass' ? ' Styling was dropped.' : '');
  }

  $('file').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    name = f.name.replace(/\.[^.]+$/, '') || 'subtitles';
    var fr = new FileReader();
    fr.onload = function () {
      $('input').value = S.decodeBytes(new Uint8Array(fr.result), $('encoding').value).text;
      run();
    };
    fr.readAsArrayBuffer(f);
  });
  $('extract').addEventListener('click', run);
  ['mode', 'gap', 'timestamps', 'tags', 'dedupe'].forEach(function (id) {
    $(id).addEventListener('change', function () { if ($('input').value.trim()) run(); });
  });
  $('download').addEventListener('click', function () {
    if (!$('output').value) { run(); if (!$('output').value) return; }
    var blob = new Blob([$('output').value], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  S.ENCODINGS.forEach(function (e) {
    var o = document.createElement('option');
    o.value = e[0]; o.textContent = e[1];
    $('encoding').appendChild(o);
  });
})();
