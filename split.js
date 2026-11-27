(function () {
  'use strict';
  var S = window.Subtitles;
  var $ = function (id) { return document.getElementById(id); };
  var name = 'subtitles';
  var ext = 'srt';
  var parts = ['', ''];

  function run() {
    var text = $('input').value;
    parts = ['', ''];
    $('out1').value = ''; $('out2').value = '';
    if (!text.trim()) { $('status').textContent = 'Load or paste a subtitle file first.'; return; }
    var at = S.parseTimeInput($('at').value);
    if (isNaN(at) || at <= 0) { $('status').textContent = 'Enter the split time as hh:mm:ss, mm:ss or seconds, e.g. 47:12 or 2832.'; return; }
    var p = S.parse(text);
    ext = p.format === 'vtt' ? 'vtt' : 'srt';
    var r;
    try { r = S.splitAt(p.cues, at, { rebase: $('rebase').checked }); }
    catch (e) { $('status').textContent = e.message; return; }
    parts[0] = r.first.length ? S.serialize(r.first, ext) : '';
    parts[1] = r.second.length ? S.serialize(r.second, ext) : '';
    $('out1').value = parts[0]; $('out2').value = parts[1];
    $('status').textContent = 'Part 1: ' + r.first.length + ' cues. Part 2: ' + r.second.length + ' cues.' +
      (r.clipped ? ' ' + r.clipped + ' cue(s) crossed the split and were cut at the split time.' : '') +
      (!r.first.length || !r.second.length ? ' Part ' + (r.first.length ? 2 : 1) + ' is empty: the split time is outside the subtitles.' : '') +
      (p.errors.length ? ' ' + p.errors.length + ' problem(s) skipped.' : '');
  }

  function save(i) {
    run();
    if (!parts[i]) return;
    var blob = new Blob([parts[i]], { type: ext === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.part' + (i + 1) + '.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  $('file').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    name = f.name.replace(/\.[^.]+$/, '') || 'subtitles';
    var fr = new FileReader();
    fr.onload = function () {
      $('input').value = S.decodeBytes(new Uint8Array(fr.result), $('encoding').value).text;
      if ($('at').value.trim()) run();
    };
    fr.readAsArrayBuffer(f);
  });
  $('apply').addEventListener('click', run);
  $('dl1').addEventListener('click', function () { save(0); });
  $('dl2').addEventListener('click', function () { save(1); });
  S.ENCODINGS.forEach(function (e) {
    var o = document.createElement('option');
    o.value = e[0]; o.textContent = e[1];
    $('encoding').appendChild(o);
  });
})();
