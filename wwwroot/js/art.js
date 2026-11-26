/* Product illustrations (flat, child-friendly). Each returns an SVG string, viewBox 240x180. */
var ART = (function () {
  function wrap(bg, body) {
    return '<svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">' +
      '<rect width="240" height="180" fill="' + bg + '"/>' +
      '<circle cx="200" cy="30" r="46" fill="#fff" opacity=".35"/><circle cx="28" cy="160" r="38" fill="#fff" opacity=".28"/>' +
      '<ellipse cx="120" cy="160" rx="78" ry="9" fill="#000" opacity=".08"/>' + body + '</svg>';
  }
  var A = {};

  A.crayons = function () {
    var cols = ['#E5243B', '#F7941D', '#FDB913', '#7DC242', '#13B0EA', '#1F6FE0', '#7B3FA0', '#E3247F'];
    var s = '';
    cols.forEach(function (c, i) {
      var x = 62 + i * 15;
      s += '<rect x="' + x + '" y="40" width="12" height="72" rx="2" fill="' + c + '"/>' +
        '<path d="M' + x + ' 40 L' + (x + 6) + ' 24 L' + (x + 12) + ' 40Z" fill="' + c + '"/>' +
        '<rect x="' + x + '" y="58" width="12" height="6" fill="#fff" opacity=".55"/>';
    });
    return wrap('#FFF1D6', s +
      '<rect x="52" y="84" width="136" height="70" rx="8" fill="#1F6FE0"/>' +
      '<rect x="52" y="84" width="136" height="16" rx="8" fill="#4B1D7D"/>' +
      '<text x="120" y="130" text-anchor="middle" font-family="Baloo 2,Arial" font-weight="800" font-size="22" fill="#fff">24 Colours</text>' +
      '<circle cx="76" cy="138" r="6" fill="#FDB913"/><circle cx="164" cy="138" r="6" fill="#E3247F"/>');
  };

  A.storybook = function () {
    return wrap('#E3F4FF',
      '<path d="M50 50 Q120 30 120 52 L120 150 Q120 132 50 146Z" fill="#fff" stroke="#1F6FE0" stroke-width="3"/>' +
      '<path d="M190 50 Q120 30 120 52 L120 150 Q120 132 190 146Z" fill="#fff" stroke="#1F6FE0" stroke-width="3"/>' +
      '<path d="M58 58 Q110 44 114 60 L114 138 Q108 128 58 138Z" fill="#7DC242"/>' +
      '<circle cx="84" cy="84" r="12" fill="#FDB913"/>' +
      '<path d="M62 132 L80 104 L94 120 L104 108 L114 124 L114 136Z" fill="#2E7D32"/>' +
      '<rect x="130" y="64" width="50" height="5" rx="2" fill="#9DB3D6"/><rect x="130" y="76" width="44" height="5" rx="2" fill="#9DB3D6"/>' +
      '<rect x="130" y="88" width="50" height="5" rx="2" fill="#9DB3D6"/><rect x="130" y="100" width="36" height="5" rx="2" fill="#9DB3D6"/>' +
      '<rect x="130" y="112" width="48" height="5" rx="2" fill="#9DB3D6"/>');
  };

  A.bottle = function () {
    return wrap('#E6FAF4',
      '<rect x="98" y="22" width="44" height="18" rx="6" fill="#4B1D7D"/>' +
      '<rect x="104" y="38" width="32" height="12" fill="#6B3FA0"/>' +
      '<rect x="86" y="48" width="68" height="108" rx="22" fill="#13B0EA"/>' +
      '<rect x="86" y="80" width="68" height="40" fill="#fff" opacity=".9"/>' +
      '<path d="M98 100 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10" fill="none" stroke="#1F6FE0" stroke-width="4" stroke-linecap="round"/>' +
      '<rect x="96" y="56" width="8" height="90" rx="4" fill="#fff" opacity=".35"/>');
  };

  A.pencils = function () {
    var s = '';
    ['#FDB913', '#E3247F', '#13B0EA', '#7DC242', '#F7941D'].forEach(function (c, i) {
      var y = 46 + i * 18;
      s += '<rect x="56" y="' + y + '" width="100" height="12" fill="' + c + '"/>' +
        '<path d="M156 ' + y + ' L180 ' + (y + 6) + ' L156 ' + (y + 12) + 'Z" fill="#F3D2A2"/>' +
        '<path d="M172 ' + (y + 4) + ' L180 ' + (y + 6) + ' L172 ' + (y + 8) + 'Z" fill="#333"/>' +
        '<rect x="46" y="' + y + '" width="10" height="12" fill="#C0C0C0"/><rect x="38" y="' + y + '" width="8" height="12" rx="3" fill="#F48FB1"/>';
    });
    return wrap('#FFF6E0', s + '<rect x="160" y="128" width="30" height="22" rx="4" fill="#1F6FE0"/><circle cx="175" cy="139" r="6" fill="#fff"/>');
  };

  A.notebooks = function () {
    return wrap('#F0EAFF',
      '<rect x="66" y="40" width="96" height="116" rx="6" fill="#7DC242" transform="rotate(-8 114 98)"/>' +
      '<rect x="78" y="34" width="96" height="116" rx="6" fill="#F7941D" transform="rotate(4 126 92)"/>' +
      '<rect x="72" y="32" width="96" height="116" rx="6" fill="#4B1D7D"/>' +
      '<rect x="72" y="32" width="14" height="116" fill="#2E1450"/>' +
      '<rect x="96" y="56" width="58" height="26" rx="4" fill="#fff"/>' +
      '<rect x="102" y="64" width="44" height="4" rx="2" fill="#4B1D7D"/><rect x="102" y="72" width="30" height="4" rx="2" fill="#E3247F"/>');
  };

  A.clay = function () {
    return wrap('#FFEAF2',
      '<rect x="40" y="110" width="160" height="40" rx="10" fill="#fff" stroke="#F3B6CE" stroke-width="3"/>' +
      '<path d="M60 112 q-4 -34 26 -36 q30 2 22 36Z" fill="#E5243B"/>' +
      '<path d="M104 112 q0 -46 34 -42 q30 6 18 42Z" fill="#FDB913"/>' +
      '<path d="M150 112 q2 -28 24 -26 q20 4 14 26Z" fill="#13B0EA"/>' +
      '<circle cx="122" cy="88" r="4" fill="#333"/><circle cx="140" cy="88" r="4" fill="#333"/>' +
      '<path d="M122 98 q9 8 18 0" stroke="#333" stroke-width="3" fill="none" stroke-linecap="round"/>');
  };

  A.geometry = function () {
    return wrap('#E9F0FF',
      '<rect x="42" y="56" width="156" height="92" rx="10" fill="#1F6FE0"/>' +
      '<rect x="50" y="64" width="140" height="76" rx="6" fill="#DDE9FF"/>' +
      '<path d="M62 128 L62 76 L110 128Z" fill="none" stroke="#E3247F" stroke-width="4"/>' +
      '<path d="M120 128 a28 28 0 0 1 56 0Z" fill="none" stroke="#4B1D7D" stroke-width="4"/>' +
      '<line x1="148" y1="128" x2="148" y2="104" stroke="#4B1D7D" stroke-width="3"/>' +
      '<rect x="56" y="40" width="128" height="14" rx="3" fill="#FDB913"/>' +
      '<path d="M66 40 v6 M78 40 v8 M90 40 v6 M102 40 v8 M114 40 v6 M126 40 v8 M138 40 v6 M150 40 v8 M162 40 v6 M174 40 v8" stroke="#7A5A00" stroke-width="2"/>');
  };

  A.puzzle = function () {
    return wrap('#FFF4D6',
      '<rect x="44" y="34" width="70" height="56" rx="6" fill="#E3247F"/>' +
      '<rect x="120" y="34" width="70" height="56" rx="6" fill="#13B0EA"/>' +
      '<rect x="44" y="96" width="70" height="56" rx="6" fill="#7DC242"/>' +
      '<rect x="128" y="104" width="70" height="56" rx="6" fill="#F7941D" transform="rotate(10 163 132)"/>' +
      '<circle cx="117" cy="62" r="10" fill="#E3247F"/><circle cx="79" cy="93" r="10" fill="#7DC242"/>' +
      '<circle cx="155" cy="93" r="10" fill="#13B0EA"/>' +
      '<path d="M64 52 q10 -8 20 2 q8 12 -4 22 q-14 6 -16 -6Z" fill="#fff" opacity=".6"/>');
  };

  A.lunchbox = function () {
    return wrap('#E7F8E6',
      '<rect x="44" y="62" width="152" height="90" rx="18" fill="#F7941D"/>' +
      '<rect x="44" y="62" width="152" height="30" rx="14" fill="#FDB913"/>' +
      '<rect x="98" y="40" width="44" height="26" rx="10" fill="none" stroke="#4B1D7D" stroke-width="7"/>' +
      '<rect x="62" y="104" width="50" height="34" rx="8" fill="#fff"/><rect x="122" y="104" width="56" height="34" rx="8" fill="#fff"/>' +
      '<circle cx="80" cy="121" r="8" fill="#7DC242"/><circle cx="96" cy="118" r="6" fill="#E5243B"/>' +
      '<rect x="130" y="114" width="40" height="14" rx="7" fill="#F3D2A2"/>');
  };

  A.football = function () {
    return wrap('#E6F7EC',
      '<circle cx="120" cy="92" r="58" fill="#fff" stroke="#2D2D2D" stroke-width="4"/>' +
      '<path d="M120 70 l20 14 -8 24 h-24 l-8 -24Z" fill="#2D2D2D"/>' +
      '<path d="M120 34 v36 M140 84 l32 -12 M132 108 l18 26 M108 108 l-18 26 M100 84 l-32 -12" stroke="#2D2D2D" stroke-width="3"/>' +
      '<path d="M78 56 l12 -12 18 4 M162 56 l-12 -12 -18 4 M66 104 l6 18 M174 104 l-6 18 M100 146 l20 4 20 -4" stroke="#2D2D2D" stroke-width="3" fill="none"/>');
  };

  A.globe = function () {
    return wrap('#E3F4FF',
      '<rect x="96" y="146" width="48" height="10" rx="5" fill="#4B1D7D"/><rect x="116" y="126" width="8" height="22" fill="#4B1D7D"/>' +
      '<path d="M66 118 a62 62 0 0 0 108 -12" fill="none" stroke="#FDB913" stroke-width="7" stroke-linecap="round"/>' +
      '<circle cx="120" cy="76" r="52" fill="#13B0EA"/>' +
      '<path d="M86 52 q18 -10 30 4 q-6 14 -20 12 q-8 12 -18 4Z M126 60 q20 -4 26 14 q-4 18 -18 14 q-10 -12 -8 -28Z M100 96 q14 -2 18 12 q-8 14 -20 6Z" fill="#7DC242"/>' +
      '<circle cx="104" cy="56" r="40" fill="#fff" opacity=".12"/>');
  };

  A.sciencekit = function () {
    return wrap('#F0EAFF',
      '<path d="M78 40 h24 v34 l26 52 a10 10 0 0 1 -9 14 h-58 a10 10 0 0 1 -9 -14 l26 -52Z" fill="#fff" stroke="#4B1D7D" stroke-width="4"/>' +
      '<path d="M66 108 h50 l10 18 a6 6 0 0 1 -5 8 h-60 a6 6 0 0 1 -5 -8Z" fill="#7DC242"/>' +
      '<circle cx="84" cy="98" r="5" fill="#7DC242"/><circle cx="96" cy="86" r="3" fill="#7DC242"/>' +
      '<rect x="138" y="56" width="22" height="86" rx="10" fill="#fff" stroke="#4B1D7D" stroke-width="4"/>' +
      '<rect x="142" y="96" width="14" height="42" rx="6" fill="#E3247F"/>' +
      '<circle cx="182" cy="122" r="18" fill="none" stroke="#1F6FE0" stroke-width="6"/><line x1="194" y1="134" x2="206" y2="148" stroke="#1F6FE0" stroke-width="7" stroke-linecap="round"/>');
  };

  A.schoolbag = function () {
    return wrap('#FFE9EE',
      '<path d="M92 40 q28 -26 56 0" fill="none" stroke="#4B1D7D" stroke-width="8"/>' +
      '<rect x="66" y="40" width="108" height="118" rx="26" fill="#E3247F"/>' +
      '<rect x="80" y="96" width="80" height="50" rx="12" fill="#B5155E"/>' +
      '<rect x="80" y="96" width="80" height="14" rx="7" fill="#FDB913"/>' +
      '<rect x="112" y="60" width="16" height="24" rx="4" fill="#FDB913"/>' +
      '<circle cx="96" cy="70" r="6" fill="#fff" opacity=".6"/><circle cx="146" cy="74" r="4" fill="#fff" opacity=".6"/>');
  };

  A.headphones = function () {
    return wrap('#E9F0FF',
      '<path d="M64 112 v-20 a56 56 0 0 1 112 0 v20" fill="none" stroke="#4B1D7D" stroke-width="12" stroke-linecap="round"/>' +
      '<rect x="48" y="98" width="38" height="56" rx="16" fill="#1F6FE0"/><rect x="154" y="98" width="38" height="56" rx="16" fill="#1F6FE0"/>' +
      '<rect x="56" y="108" width="22" height="36" rx="10" fill="#13B0EA"/><rect x="162" y="108" width="22" height="36" rx="10" fill="#13B0EA"/>' +
      '<path d="M100 54 l6 -10 6 10 M128 50 l8 -8 4 12" stroke="#FDB913" stroke-width="5" fill="none" stroke-linecap="round"/>');
  };

  A.paints = function () {
    var cols = ['#E5243B', '#F7941D', '#FDB913', '#7DC242', '#13B0EA', '#1F6FE0', '#7B3FA0', '#5D4037'];
    var s = '<rect x="38" y="70" width="164" height="66" rx="10" fill="#fff" stroke="#C9D4F2" stroke-width="3"/>';
    cols.forEach(function (c, i) {
      var x = 58 + (i % 4) * 38, y = 86 + Math.floor(i / 4) * 30;
      s += '<ellipse cx="' + x + '" cy="' + y + '" rx="14" ry="10" fill="' + c + '"/>';
    });
    return wrap('#FFF4E5', s + '<rect x="70" y="30" width="110" height="8" rx="4" fill="#F3D2A2" transform="rotate(-12 125 34)"/>' +
      '<path d="M64 46 l20 -6 4 10 -18 8Z" fill="#E3247F"/>');
  };

  A.rope = function () {
    return wrap('#E7F8E6',
      '<path d="M66 54 C40 150 200 150 174 54" fill="none" stroke="#E3247F" stroke-width="6"/>' +
      '<rect x="56" y="22" width="20" height="44" rx="9" fill="#FDB913"/><rect x="164" y="22" width="20" height="44" rx="9" fill="#FDB913"/>' +
      '<rect x="60" y="30" width="12" height="6" fill="#F7941D"/><rect x="168" y="30" width="12" height="6" fill="#F7941D"/>');
  };

  A.chessboard = function () {
    var s = '<rect x="60" y="40" width="120" height="120" rx="6" fill="#4B1D7D"/>';
    for (var r = 0; r < 6; r++) for (var c = 0; c < 6; c++)
      if ((r + c) % 2 === 0) s += '<rect x="' + (66 + c * 18) + '" y="' + (46 + r * 18) + '" width="18" height="18" fill="#FFE7A3"/>';
    return wrap('#FFF6E0', s + '<path d="M164 66 q12 -20 26 -6 q4 10 -6 14 l6 22 h-24 l6 -18 q-10 0 -8 -12Z" fill="#E3247F"/>');
  };

  A.badge = function () {  // certificate / reward badge for wallet and earn screens
    return wrap('#FFF6E0',
      '<path d="M98 110 l-16 46 22 -10 12 20 6 -50Z M142 110 l16 46 -22 -10 -12 20 -6 -50Z" fill="#E3247F"/>' +
      '<circle cx="120" cy="78" r="46" fill="#FDB913"/><circle cx="120" cy="78" r="34" fill="#FFD45C"/>' +
      '<path d="M120 54 l7 15 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2Z" fill="#fff"/>');
  };

  return A;
})();
