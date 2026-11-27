(function () {
  'use strict';
  var S = window.Subtitles;
  var $ = function (id) { return document.getElementById(id); };
  var name = 'subtitles';
  var rendered = '';

  function renderStyles() {
    var box = $('styles');
    var list = S.assStyles($('input').value);
    var key = list.map(function (s) { return s.name + ':' + s.count; }).join('|');
    if (key === rendered) return;
    rendered = key;
    var prev = {};
    Array.prototype.forEach.call(box.querySelectorAll('input'), function (c) { prev[c.value] = c.checked; });
    box.textContent = '';
    $('stylesWrap').hidden = list.length < 2;
    list.forEach(function (s) {
      var l = document.createElement('label');
      var c = document.createElement('input');
      c.type = 'checkbox';
      c.value = s.name;
      c.checked = s.name in prev ? prev[s.name] : !/^(signs?|songs?|op|ed|karaoke|titles?|credits?)([^a-z]|$)/i.test(s.name);
      c.addEventListener('change', run);
      l.appendChild(c);
      l.appendChild(document.createTextNode(' ' + s.name + ' (' + s.count + ')'));
      box.appendChild(l);
    });
  }

  function run() {
    var text = $('input').value;
    if (!text.trim()) { $('status').textContent = 'Paste an ASS/SSA file or choose one.'; $('output').value = ''; return; }
    renderStyles();
    var skip = [];
    if (!$('stylesWrap').hidden) {
      Array.prototype.forEach.call($('styles').querySelectorAll('input'), function (c) { if (!c.checked) skip.push(c.value); });
    }
    var r = S.convert(text, 'srt', { keepFormatting: $('format').checked, skipStyles: skip });
    $('output').value = r.text;
    $('status').textContent = (r.from === 'ass' ? '' : 'Input is ' + r.from.toUpperCase() + ', not ASS. ') + r.count + ' cues written as SRT.' +
      (skip.length ? ' Skipped styles: ' + skip.join(', ') + '.' : '') +
      (r.errors.length ? ' ' + r.errors.length + ' problem(s): ' + r.errors[0].message + '.' : '');
  }

  $('file').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    name = f.name.replace(/\.[^.]+$/, '') || 'subtitles';
    var fr = new FileReader();
    fr.onload = function () {
      $('input').value = S.decodeBytes(new Uint8Array(fr.result), $('encoding').value).text;
      rendered = '';
      run();
    };
    fr.readAsArrayBuffer(f);
  });
  $('input').addEventListener('input', function () { $('stylesWrap').hidden = true; rendered = ''; });
  $('convert').addEventListener('click', run);
  $('format').addEventListener('change', function () { if ($('input').value.trim()) run(); });
  $('download').addEventListener('click', function () {
    if (!$('output').value) { run(); if (!$('output').value) return; }
    var blob = new Blob([$('output').value], { type: 'application/x-subrip;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.srt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  S.ENCODINGS.forEach(function (e) {
    var o = document.createElement('option');
    o.value = e[0]; o.textContent = e[1];
    $('encoding').appendChild(o);
  });
})();
