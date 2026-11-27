(function () {
  'use strict';
  var S = window.Subtitles;
  var $ = function (id) { return document.getElementById(id); };
  var name = 'subtitles';

  function run() {
    var text = $('input').value;
    if (!text.trim()) { $('status').textContent = 'Paste subtitles or choose a file.'; $('output').value = ''; return; }
    var t = $('target').value;
    var r = S.convert(text, t === 'auto' ? undefined : t);
    $('output').value = r.text;
    $('status').textContent = r.count + ' cues converted: ' + r.from.toUpperCase() + ' to ' + r.to.toUpperCase() + '.' +
      (r.errors.length ? ' ' + r.errors.length + ' problem(s) skipped.' : '') + (r.from === 'ass' ? ' Styling was dropped.' : '');
    $('download').dataset.ext = r.to;
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
  $('convert').addEventListener('click', run);
  $('target').addEventListener('change', function () { if ($('input').value.trim()) run(); });
  $('download').addEventListener('click', function () {
    if (!$('output').value) { run(); if (!$('output').value) return; }
    var ext = $('download').dataset.ext || 'vtt';
    var blob = new Blob([$('output').value], { type: ext === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  S.ENCODINGS.forEach(function (e) {
    var o = document.createElement('option');
    o.value = e[0]; o.textContent = e[1];
    $('encoding').appendChild(o);
  });
})();
