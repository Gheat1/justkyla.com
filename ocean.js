/* ocean.js — justkyla.com animated sunset-ocean background + dolphin leaps.
   Vanilla, no deps. Creates its own canvas, styles and fallback layers. */
(function () {
  'use strict';
  if (window.__oceanBooted) return;
  window.__oceanBooted = 1;

  var W = window, D = document, DE = D.documentElement;
  function mq(q) { return W.matchMedia ? W.matchMedia(q) : { matches: false, addListener: 0 }; }
  var rmMQ = mq('(prefers-reduced-motion: reduce)');
  var reduce = !!rmMQ.matches;

  /* ---------------------------------------------------------------- tiering */
  var HOR_TOP = 0.44;                  // horizon, fraction from top of viewport
  var tier, gl, prog, U = {}, glCanvas, fxCanvas, fx, bgEl;
  var resScale = 1, cssW = 0, cssH = 0, horPx = 0;

  function pickTier() {
    var cores = navigator.hardwareConcurrency || 2;
    var mem = navigator.deviceMemory;
    if (typeof mem !== 'number' || !mem) mem = cores >= 8 ? 8 : cores >= 4 ? 4 : 2;
    var s = 0;
    s += cores >= 8 ? 2 : cores >= 4 ? 1 : 0;
    s += mem >= 8 ? 2 : mem >= 4 ? 1 : 0;
    s += W.innerWidth >= 1100 ? 1 : 0;
    if (mq('(pointer: coarse)').matches) s -= 1;
    return s >= 4 ? 'high' : s >= 2 ? 'medium' : 'low';
  }

  var GLOPT = {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false,
    powerPreference: 'low-power', failIfMajorPerformanceCaveat: false
  };
  function getGL(c) {
    try {
      return c.getContext('webgl2', GLOPT) || c.getContext('webgl', GLOPT) ||
             c.getContext('experimental-webgl', GLOPT);
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------- CSS */
  var SKY_CSS =
    'linear-gradient(to bottom,#0B1E3E 0%,#232A4E 14%,#6E4A82 26%,#F97A6D 37%,#FF9E76 41.5%,' +
    '#FFC978 43.6%,#FFD9A4 44%,#2E6E88 44.2%,#1B5F80 56%,#0E2E4B 78%,#07182E 100%)';

  /* One soft glint tile; `a` is its peak alpha.
     Deliberately as wide as its own tile (98%) so horizontally adjacent copies
     overlap and merge into continuous wave streaks. A narrow ellipse leaves gaps
     and the eye immediately reads the repeat as a dot grid instead of water. */
  function OB_WAVE(a) {
    return 'radial-gradient(ellipse 98% 44% at 50% 50%,rgba(255,236,214,' + a + '),rgba(255,236,214,0) 78%)';
  }
  /* fade a band in from its top edge so neighbouring bands don't seam */
  function OB_MASK(stop) {
    var g = 'linear-gradient(180deg,rgba(0,0,0,0) 0,#000 ' + stop + ')';
    return '-webkit-mask-image:' + g + ';mask-image:' + g;
  }

  function injectCSS() {
    var s = D.createElement('style');
    s.id = 'ocean-style';
    s.textContent =
    /* body must form a stacking context or its own background paints over the
       negative-z canvases (they are painted with the root context otherwise). */
    'body{isolation:isolate}' +
    '#ocean-bg,#ocean-fx{position:fixed;left:0;top:0;width:100%;height:100%;' +
      'pointer-events:none;border:0;padding:0;margin:0;display:block}' +
    '#ocean-bg{z-index:-2;background:' + SKY_CSS + '}' +
    '#ocean-fx{z-index:-1;background:transparent}' +
    '#ocean-bg>i{position:absolute;display:block;left:0;right:0}' +
    '.ob-sun{top:' + ((HOR_TOP - 0.055) * 100).toFixed(2) + '%;height:22vh;' +
      'background:radial-gradient(ellipse 15vh 11vh at 61% 74%,rgba(255,247,232,.98) 0%,rgba(255,201,120,.85) 26%,' +
      'rgba(249,150,109,.42) 46%,rgba(249,122,109,.16) 66%,rgba(249,122,109,0) 82%)}' +
    '.ob-path{top:' + (HOR_TOP * 100).toFixed(2) + '%;bottom:0;' +
      'background:radial-gradient(ellipse 26% 78% at 61% 0%,rgba(255,214,150,.5) 0%,rgba(255,170,110,.22) 40%,rgba(255,160,100,0) 78%)}' +
    /* Water, without a GPU. Three depth bands instead of one flat field: the
       wave tiles get smaller and tighter toward the horizon, which is what
       actually sells perspective. Each band stacks two gradient layers whose
       tile widths are coprime and which drift in OPPOSITE directions, so the
       repeat never resolves into the visible lattice a single tiled gradient
       gives you. Each band's top edge is masked to a fade so the bands melt
       into each other rather than seaming. */
    '.ob-w{background-repeat:repeat}' +
    '.ob-far{top:' + (HOR_TOP * 100).toFixed(2) + '%;height:9%;opacity:.34;' +
      'background-image:' + OB_WAVE('.5') + ',' + OB_WAVE('.36') + ';' +
      'background-size:37px 4px,58px 3px;' +
      'animation:ob-far 26s linear infinite;' +
      OB_MASK('72%') + '}' +
    '.ob-mid{top:' + ((HOR_TOP + 0.075) * 100).toFixed(2) + '%;height:15%;opacity:.36;' +
      'background-image:' + OB_WAVE('.52') + ',' + OB_WAVE('.34') + ';' +
      'background-size:83px 9px,127px 7px;' +
      'animation:ob-mid 34s linear infinite;' +
      OB_MASK('46%') + '}' +
    '.ob-near{top:' + ((HOR_TOP + 0.2) * 100).toFixed(2) + '%;bottom:0;opacity:.3;' +
      'background-image:' + OB_WAVE('.5') + ',' + OB_WAVE('.32') + ';' +
      'background-size:179px 21px,251px 16px;' +
      'animation:ob-near 46s linear infinite;' +
      OB_MASK('34%') + '}' +
    '@keyframes ob-far{to{background-position:37px 0,-58px 0}}' +
    '@keyframes ob-mid{to{background-position:-83px 0,127px 0}}' +
    '@keyframes ob-near{to{background-position:179px 0,-251px 0}}' +
    '@media (prefers-reduced-motion:reduce){.ob-w{animation:none!important}}';
    (D.head || DE).appendChild(s);
  }

  function buildFallback() {
    bgEl = D.createElement('div');
    bgEl.id = 'ocean-bg';
    bgEl.setAttribute('aria-hidden', 'true');
    var parts = ['ob-sun', 'ob-path', 'ob-w ob-near', 'ob-w ob-mid', 'ob-w ob-far'];
    for (var i = 0; i < parts.length; i++) {
      var e = D.createElement('i'); e.className = parts[i]; bgEl.appendChild(e);
    }
    return bgEl;
  }

  /* ------------------------------------------------------------------ GLSL */
  var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  var FS = [
    'uniform vec2 uR;uniform float uT;uniform float uH;uniform float uK;',
    'uniform float uCam;uniform vec3 uS;',
    'const vec3 K0=vec3(1.,.50,.135);',    /* horizon gold  */
    'const vec3 K1=vec3(.98,.375,.205);',  /* peach         */
    'const vec3 K2=vec3(.80,.205,.175);',  /* coral         */
    'const vec3 K3=vec3(.150,.070,.230);', /* dusk          */
    'const vec3 K4=vec3(.0035,.016,.062);',/* night         */
    'const vec3 SUNC=vec3(1.,.755,.42);',
    'const vec3 ABY=vec3(.0012,.010,.034);',
    'const vec3 DEP=vec3(.004,.034,.088);',
    'const vec3 SEA=vec3(.013,.142,.255);',
    'const vec3 TEA=vec3(.055,.410,.495);',
    'const vec3 FOA=vec3(.39,.79,.745);',
    'vec2 r2(vec2 v,float a){float c=cos(a),s=sin(a);return vec2(v.x*c-v.y*s,v.x*s+v.y*c);}',
    'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',

    /* --- sky without clouds (also used for water reflections) --- */
    'vec3 skyB(vec3 rd,float sa){',
    ' float e=rd.y,t=max(e,0.);',
    ' vec3 c=K0;',
    ' c=mix(c,K1,smoothstep(0.,.055,t));',
    ' c=mix(c,K2,smoothstep(.045,.135,t));',
    ' c=mix(c,K3,smoothstep(.115,.265,t));',
    ' c=mix(c,K4,smoothstep(.25,.48,t));',
    ' c*=1.-.45*smoothstep(0.,-.10,e);',
    ' vec3 dv=rd-uS;float ad=length(dv);',
    ' float core=exp(-pow(ad*30.,2.8));',
    ' float b1=exp(-ad*13.),b2=exp(-ad*5.2);',
    ' float hz=exp(-abs(dv.x)*3.4)*exp(-abs(e)*26.);',
    ' c+=SUNC*(core*6.*sa+b1*.62*sa+b2*.13)+vec3(1.,.40,.17)*hz*.34;',
    ' return c;}',

    '#if CLOUDS',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' float a=h21(i),b=h21(i+vec2(1,0)),c=h21(i+vec2(0,1)),d=h21(i+vec2(1,1));',
    ' return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
    'float cf(vec2 p){float v=0.,a=.56;for(int i=0;i<4;i++){v+=a*vn(p);p=r2(p,.7)*2.03;a*=.5;}return v;}',
    '#endif',

    'vec3 sky(vec3 rd){',
    ' vec3 c=skyB(rd,1.);',
    '#if CLOUDS',
    ' if(rd.y>.02){',
    '  vec2 q=rd.xz/(rd.y+.075)*vec2(.30,1.5);',
    '  float d=cf(q+vec2(uT*.010,uT*.004));',
    '  d=smoothstep(.46,.88,d)*smoothstep(.02,.13,rd.y)*(1.-smoothstep(.22,.50,rd.y));',
    '  float lt=pow(max(dot(rd,uS),0.),6.);',
    '  vec3 cc=mix(vec3(.055,.028,.062),SUNC*1.35,lt*.80+.20);',
    '  c=mix(c,cc,d*.52);}',
    '#endif',
    ' return c;}',

    /* --- travelling wave sum: height + analytic gradient --- */
    /* sum of travelling waves; crest phase is bent sideways so crests break up
       into finite arcs instead of infinite parallel lines. */
    'float waves(vec2 p,float fp,out vec2 gr,out float hn){',
    ' gr=vec2(0.);float h=0.,an=0.,k=3.2;',
    ' for(int i=0;i<OCT;i++){',
    /* peaked spectrum: gentle swell, most energy in ~0.35m ripples */
    '  float g=(float(i)-3.2)*.4167;',
    '  float st=.185*exp(-g*g);',
    '  float w=1.-smoothstep(.62,2.2,fp*k);',
    '  float a=st/k;an+=a;',
    '  if(w>.002){',
    '   float ag=1.35*sin(float(i)*2.399+.7);',
    '   vec2 d=vec2(sin(ag),cos(ag)),q=vec2(d.y,-d.x);',
    '   float om=sqrt(9.8*k)*.55;',
    '   float mb=.30+.11*float(i);',
    '   float ph=k*mb*dot(q,p)-om*.55*uT;',
    '   float x=k*dot(d,p)-om*uT+(.58/mb)*sin(ph);',
    '   float e=exp(sin(x)-1.),de=cos(x)*e;',
    '   h+=a*e*w;',
    '   gr+=(d+q*(.58*cos(ph)))*st*de*w;}',
    '  k*=1.78;}',
    ' hn=h/max(an,1e-4);return h;}',

    'void main(){',
    ' vec2 s=gl_FragCoord.xy/uR;',
    ' vec2 u=vec2((s.x-.5)*(uR.x/uR.y),s.y-uH)*uK;',
    ' vec3 rd=normalize(vec3(u,-1.));',
    ' float du=uK/uR.y;',
    ' vec3 col;',
    ' if(rd.y>du*2.5){col=sky(rd);}else{',
    '  vec3 skc=skyB(rd,1.);',
    '  float t=uCam/max(-rd.y,2e-4);',
    '  vec2 p=rd.xz*t;',
    '  float fp=t*t*du/uCam;',
    '  vec2 gr;float hn;waves(p,fp,gr,hn);',
    '#if DETAIL',
    '  float cw=(1.-smoothstep(.02,.12,fp))*.85;',
    '  if(cw>.01){',
    '   vec2 d1=vec2(.94,.34),d2=vec2(-.42,.91);',
    '   float x1=dot(d1,p)*54.-16.4*uT,x2=dot(d2,p)*79.+19.6*uT;',
    '   gr+=d1*cos(x1)*.042*cw+d2*cos(x2)*.030*cw;}',
    '#endif',
    '  vec3 N=normalize(vec3(-gr.x,1.,-gr.y));',
    '  vec3 V=-rd;',
    '  float fr=.02+.98*pow(1.-max(dot(N,V),0.),5.);',
    '  vec3 rr=reflect(rd,N);rr.y=max(rr.y,.002);',
    '  vec3 refl=skyB(rr,.55)*vec3(.80,.85,.98);',
    '  float tilt=-dot(gr,uS.xz);',
    '  vec3 body=mix(DEP,SEA,.26+.60*smoothstep(-.34,.40,tilt));',
    '  body=mix(body,ABY,.72*smoothstep(.03,.36,-rd.y));',
    '  float bk=pow(max(dot(rd,uS),0.),9.);',
    '  vec3 sss=mix(TEA,SUNC,.72)*bk*smoothstep(.46,.95,hn)*.40;',
    '  vec3 hv=normalize(uS+V);',
    '  float nh=max(dot(N,hv),0.);',
    '  float rg=clamp(fp*30.,0.,1.);',
    '  float sp=pow(nh,mix(SHARP,150.,rg))*mix(6.5,1.25,rg)+pow(nh,mix(90.,26.,rg))*.11;',
    '  float pt=.70+.30*sin(p.x*.21+uT*.07)*sin(p.y*.15-uT*.05);',
    '  float fm=smoothstep(.90,1.,hn)*(1.-smoothstep(.02,.09,fp))*.035;',
    '  vec3 wat=mix(body,refl,fr)+sss+SUNC*sp*pt*(.52+.48*fr)+FOA*fm;',
    '  wat=mix(wat,skc*.70,.60*(1.-exp(-t*.0026)));',
    '  col=mix(sky(rd),wat,smoothstep(-du*1.3,du*1.3,-rd.y));}',
    ' col=vec3(1.)-exp(-col*1.06);',
    ' col*=1.-.17*pow(min(length(s-.5)*1.26,1.),2.6);',
    ' col=sqrt(max(col,0.));',
    ' col+=(h21(gl_FragCoord.xy+fract(uT)*37.)-.5)*.0035;',
    ' gl_FragColor=vec4(col,1.);}'
  ].join('\n');

  function defines(t) {
    if (t === 'high') return '#define OCT 8\n#define CLOUDS 1\n#define DETAIL 1\n#define SHARP 700.\n';
    if (t === 'medium') return '#define OCT 6\n#define CLOUDS 1\n#define DETAIL 1\n#define SHARP 480.\n';
    return '#define OCT 5\n#define CLOUDS 0\n#define DETAIL 0\n#define SHARP 240.\n';
  }

  function sh(type, src) {
    var o = gl.createShader(type);
    gl.shaderSource(o, src); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) {
      if (W.console) console.warn('[ocean]', gl.getShaderInfoLog(o));
      gl.deleteShader(o); return null;
    }
    return o;
  }

  function buildProgram() {
    var hp = gl.getShaderPrecisionFormat &&
             gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    var pre = 'precision ' + (hp && hp.precision > 0 ? 'highp' : 'mediump') + ' float;\n';
    var v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, pre + defines(tier) + FS);
    if (!v || !f) return false;
    var p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (W.console) console.warn('[ocean]', gl.getProgramInfoLog(p));
      return false;
    }
    if (prog) gl.deleteProgram(prog);
    prog = p; gl.useProgram(p);
    ['uR', 'uT', 'uH', 'uK', 'uCam', 'uS'].forEach(function (n) { U[n] = gl.getUniformLocation(p, n); });
    var loc = gl.getAttribLocation(p, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return true;
  }

  var FOVK = 1.22, CAMH = 2.2, SUN_EL = 0.040;

  /* Where to put the sun, horizontally.
     The shader builds each ray as u.x = (s.x - .5) * aspect * uK and the sun as
     sx = off * .5 * aspect * uK, so the aspect ratio cancels and `off` is simply
     the sun's normalised screen x: it lands at s.x = .5 + off/2.
     That lets us solve for a placement rather than eyeball one — park the disc
     just past the right edge of the centred content card so its bloom and its
     reflection column fall on open water instead of hiding behind frosted
     glass. The card is min(720px, 92vw) wide and centred (see style.css).
     Clamped so it never drifts off-frame on a narrow phone, where the horizon
     sits behind the card anyway and only the reflection shows. */
  function sunOffset() {
    var halfCard = Math.min(360, cssW * 0.46);
    var clearance = 85;                        // sun disc + glow radius, px
    return Math.max(0.34, Math.min(0.80, 2 * (halfCard + clearance) / cssW));
  }

  function setupGL() {
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    if (!buildProgram()) return false;
    gl.clearColor(0, 0, 0, 1);
    return true;
  }

  function drawGL(t) {
    if (!gl || gl.isContextLost()) return;
    gl.uniform1f(U.uT, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function pushSize() {
    if (!gl) return;
    var asp = cssW / cssH;
    var sx = sunOffset() * 0.5 * asp * FOVK;
    var n = Math.sqrt(1 + sx * sx + SUN_EL * SUN_EL);
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.uniform2f(U.uR, glCanvas.width, glCanvas.height);
    gl.uniform1f(U.uH, 1 - HOR_TOP);
    gl.uniform1f(U.uK, FOVK);
    gl.uniform1f(U.uCam, CAMH);
    gl.uniform3f(U.uS, sx / n, SUN_EL / n, -1 / n);
  }

  /* ------------------------------------------------------- dolphin + splash */
  var dolphins = [], drops = [], rings = [], MAXD = 3;

  /* nose at x=1, fluke notch at x≈0.07, dorsal side is -y */
  function dolphinBody(c) {
    c.beginPath();
    c.moveTo(0.998, -0.012);
    c.bezierCurveTo(0.966, -0.026, 0.930, -0.036, 0.898, -0.048);   /* beak top */
    c.bezierCurveTo(0.874, -0.072, 0.856, -0.118, 0.818, -0.140);   /* melon    */
    c.bezierCurveTo(0.778, -0.160, 0.716, -0.168, 0.652, -0.166);   /* shoulder */
    c.bezierCurveTo(0.620, -0.164, 0.598, -0.160, 0.576, -0.154);
    c.bezierCurveTo(0.542, -0.202, 0.498, -0.278, 0.440, -0.328);   /* dorsal ↑ */
    c.bezierCurveTo(0.462, -0.254, 0.458, -0.190, 0.424, -0.146);   /* dorsal ↓ */
    c.bezierCurveTo(0.344, -0.130, 0.244, -0.098, 0.150, -0.050);   /* peduncle */
    c.bezierCurveTo(0.108, -0.080, 0.048, -0.112, -0.024, -0.132);  /* fluke ↑  */
    c.bezierCurveTo(0.006, -0.096, 0.040, -0.052, 0.062, -0.004);   /* to notch */
    c.bezierCurveTo(0.040, 0.048, 0.006, 0.096, -0.024, 0.136);     /* fluke ↓  */
    c.bezierCurveTo(0.050, 0.114, 0.110, 0.084, 0.150, 0.056);
    c.bezierCurveTo(0.252, 0.106, 0.372, 0.144, 0.492, 0.152);      /* belly    */
    c.bezierCurveTo(0.596, 0.158, 0.688, 0.146, 0.766, 0.112);
    c.bezierCurveTo(0.816, 0.090, 0.850, 0.062, 0.888, 0.044);      /* jaw      */
    c.bezierCurveTo(0.930, 0.034, 0.968, 0.024, 0.998, 0.014);
    c.bezierCurveTo(1.010, 0.008, 1.010, -0.006, 0.998, -0.012);
    c.closePath();
  }
  function dolphinFin(c) {
    c.beginPath();
    c.moveTo(0.690, 0.126);
    c.bezierCurveTo(0.650, 0.208, 0.588, 0.276, 0.500, 0.322);
    c.bezierCurveTo(0.548, 0.246, 0.596, 0.186, 0.632, 0.114);
    c.closePath();
  }

  function drawDolphin(c, d, u) {
    var tt = u * d.T;
    var hh = d.vy * tt - 0.5 * d.g * tt * tt;         /* height above water, px */
    var x = d.x + d.vx * tt, y = d.y - hh;
    var vys = -(d.vy - d.g * tt), th = Math.atan2(vys, d.vx);
    var L = d.L, sg = d.vx >= 0 ? 1 : -1;
    /* screen-up expressed in local path space (lighting + rim offset) */
    var ux = -Math.sin(th), uy = -sg * Math.cos(th);
    var fade = Math.min(1, u * 12) * Math.min(1, (1 - u) * 12);
    /* how far the body reaches along screen-up, in path units — keeps the
       lighting gradient spanning the shape at every rotation */
    var ex = 0.55 * Math.abs(Math.sin(th)) + 0.19 * Math.abs(Math.cos(th));
    var gx = ux * ex, gy = uy * ex;

    c.save();
    c.beginPath(); c.rect(0, 0, cssW, d.y + L * 0.04); c.clip();
    c.globalAlpha = 0.7 + 0.3 * fade;

    /* backlit warm halo, blurred in screen space */
    c.save();
    c.shadowColor = 'rgba(255,186,116,.45)';
    c.shadowBlur = Math.min(20, L * 0.11);
    c.translate(x, y); c.rotate(th); c.scale(L, L * sg);
    /* rim layer: brightest along the top edge */
    var gr = c.createLinearGradient(gx, gy, -gx, -gy);
    gr.addColorStop(0, '#fff4e2');
    gr.addColorStop(0.20, '#ffc07a');
    gr.addColorStop(0.40, '#7d3f26');
    gr.addColorStop(1, '#140e0d');
    c.fillStyle = gr;
    dolphinBody(c); c.fill(); dolphinFin(c); c.fill();
    c.restore();

    c.translate(x, y); c.rotate(th); c.scale(L, L * sg);
    /* body, nudged away from the light so only a thin warm rim survives */
    var g = c.createLinearGradient(gx, gy, -gx, -gy);
    g.addColorStop(0, '#33496a');
    g.addColorStop(0.22, '#182c44');
    g.addColorStop(0.58, '#0c1d31');
    g.addColorStop(1, '#060f19');
    var o = 0.017;
    c.save(); dolphinBody(c); c.clip();
    c.translate(-ux * o, -uy * o);
    dolphinBody(c); c.fillStyle = g; c.fill();
    c.restore();
    c.save(); dolphinFin(c); c.clip();
    c.translate(-ux * o * 0.7, -uy * o * 0.7);
    dolphinFin(c); c.fillStyle = '#14273c'; c.fill();
    c.restore();

    if (L > 70) {
      /* damp sheen down the flank, eye, gape */
      c.save(); dolphinBody(c); c.clip();
      var g2 = c.createLinearGradient(ux * 0.14, uy * 0.14, -ux * 0.06, -uy * 0.06);
      g2.addColorStop(0, 'rgba(255,214,168,.20)');
      g2.addColorStop(1, 'rgba(255,214,168,0)');
      c.fillStyle = g2; c.fillRect(-0.12, -0.42, 1.24, 0.84);
      c.restore();
      c.beginPath(); c.arc(0.796, -0.030, 0.0145, 0, 6.2832);
      c.fillStyle = 'rgba(6,18,31,.8)'; c.fill();
      c.beginPath();
      c.moveTo(0.982, 0.006); c.quadraticCurveTo(0.916, 0.030, 0.856, 0.034);
      c.strokeStyle = 'rgba(6,18,31,.35)'; c.lineWidth = 0.010; c.stroke();
    }
    c.restore();
    return { x: x, y: y, th: th };
  }

  function addRing(x, y, r1, w, life, col) {
    rings.push({ x: x, y: y, r0: r1 * 0.12, r1: r1, w: w, t: 0, life: life, c: col || '159,227,220' });
  }
  function addDrops(x, y, n, spd, up, sz) {
    for (var i = 0; i < n; i++) {
      var a = -Math.PI * 0.5 + (Math.random() - 0.5) * up;
      var v = spd * (0.35 + Math.random() * 0.9);
      drops.push({
        x: x + (Math.random() - 0.5) * sz * 2.4, y: y - Math.random() * sz,
        vx: Math.cos(a) * v * (0.8 + Math.random() * 0.8), vy: Math.sin(a) * v,
        r: sz * (0.18 + Math.random() * 0.42), t: 0,
        life: 0.5 + Math.random() * 0.7, g: 1500
      });
    }
  }

  function spawnDolphin(px, py) {
    if (dolphins.length >= (tier === 'low' ? 2 : MAXD)) return;
    var below = cssH - horPx;
    var f = Math.max(0.10, Math.min(1, (py - horPx) / Math.max(below, 1)));
    var L = cssH * (0.055 + 0.235 * f);
    var A = L * (0.85 + Math.random() * 0.5);
    var T = reduce ? 0.95 : 1.15 + A / cssH * 1.3;
    var dir = px > cssW * 0.5 ? -1 : 1;
    if (Math.random() < 0.25) dir = -dir;
    var d = {
      x: px, y: py, L: L, T: T,
      vy: 4 * A / T, g: 8 * A / (T * T),
      vx: dir * (L * 1.05 + A * 0.55) / T,
      t0: performance.now(), out: 0, hit: 0
    };
    dolphins.push(d);
    addRing(px, py, L * 0.55, 3.5, 0.85);
    addRing(px, py, L * 0.30, 2.2, 0.5, '255,233,207');
    addDrops(px, py, reduce ? 4 : 12, L * 1.5, 1.5, L * 0.055);
    kick();
  }

  function drawFX(now, dt) {
    var c = fx, alive = 0, i, d;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    c.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);

    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i]; r.t += dt;
      var k = r.t / r.life;
      if (k >= 1) { rings.splice(i, 1); continue; }
      var rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2.2));
      c.beginPath();
      c.ellipse ? c.ellipse(r.x, r.y, rad, rad * 0.30, 0, 0, 6.2832)
                : c.arc(r.x, r.y, rad, 0, 6.2832);
      c.strokeStyle = 'rgba(' + r.c + ',' + (0.62 * (1 - k) * (1 - k)).toFixed(3) + ')';
      c.lineWidth = r.w * (1 - k * 0.7); c.stroke();
      alive = 1;
    }

    for (i = drops.length - 1; i >= 0; i--) {
      d = drops[i]; d.t += dt;
      if (d.t >= d.life) { drops.splice(i, 1); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.vy += d.g * dt;
      var a = (1 - d.t / d.life);
      c.beginPath(); c.arc(d.x, d.y, d.r * (0.5 + a * 0.5), 0, 6.2832);
      c.fillStyle = 'rgba(255,240,220,' + (0.75 * a).toFixed(3) + ')';
      c.fill();
      alive = 1;
    }

    for (i = dolphins.length - 1; i >= 0; i--) {
      d = dolphins[i];
      var u = (now - d.t0) / (d.T * 1000);
      if (u >= 1) {
        if (!d.hit) {
          d.hit = 1;
          var ex = d.x + d.vx * d.T;
          addRing(ex, d.y, d.L * 1.5, 5, 1.35);
          addRing(ex, d.y, d.L * 0.85, 3, 0.95, '255,233,207');
          addDrops(ex, d.y, reduce ? 5 : 22, d.L * 2.7, 1.9, d.L * 0.075);
        }
        dolphins.splice(i, 1); continue;
      }
      if (u > 0.42 && !d.out) { d.out = 1; }
      drawDolphin(c, d, u);
      alive = 1;
    }
    return alive;
  }

  /* --------------------------------------------------------------- plumbing */
  var raf = 0, t0 = performance.now(), last = t0, fxDpr = 1;
  var win = [], winI = 0, cool = 0, ORDER = ['high', 'medium', 'low'];

  function capDpr() {
    var d = W.devicePixelRatio || 1;
    var lim = cssW <= 900 ? 1.5 : 2;
    if (tier === 'medium') lim = Math.min(lim, 1.5);
    if (tier === 'low') lim = 1;
    return Math.min(d, lim) * resScale;
  }

  function resize() {
    cssW = Math.max(1, W.innerWidth);
    cssH = Math.max(1, W.innerHeight || DE.clientHeight);
    horPx = cssH * HOR_TOP;
    var s = capDpr();
    if (glCanvas) {
      glCanvas.width = Math.max(2, Math.round(cssW * s));
      glCanvas.height = Math.max(2, Math.round(cssH * s));
      pushSize();
    }
    if (fxCanvas) {
      fxDpr = Math.min(W.devicePixelRatio || 1, tier === 'low' ? 1 : 2);
      fxCanvas.width = Math.round(cssW * fxDpr);
      fxCanvas.height = Math.round(cssH * fxDpr);
      fx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
      fx.lineJoin = 'round';
    }
    if (reduce) drawGL(11.5);
    kick();
  }

  function downgrade() {
    var i = ORDER.indexOf(tier);
    if (i < ORDER.length - 1) {
      tier = ORDER[i + 1];
      DE.dataset.oceanTier = tier;
      if (gl && !gl.isContextLost()) { buildProgram(); }
      resize();
    } else if (resScale > 0.55) {
      resScale = 0.55; resize();
    }
    win.length = 0; winI = 0; cool = 240;
  }

  function frame(now) {
    raf = 0;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!reduce) drawGL((now - t0) / 1000);
    var alive = drawFX(now, dt);

    if (!reduce && cool <= 0) {
      win[winI++ % 70] = dt;
      if (winI % 70 === 0) {
        var sum = 0, n = win.length;
        for (var i = 0; i < n; i++) sum += win[i];
        if (sum / n > 0.0235) downgrade();
      }
    } else if (cool > 0) cool--;

    if (!D.hidden && (!reduce || alive)) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && !D.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  /* ------------------------------------------------------------------ input */
  var lastTouch = 0;
  var SKIP = 'a,button,input,textarea,select,label,summary,[data-no-splash],[role="button"]';
  function ok(t) {
    if (!t || !t.closest) return true;
    return !t.closest(SKIP);
  }
  function onClick(e) {
    if (e.defaultPrevented || performance.now() - lastTouch < 700) return;
    if (!ok(e.target)) return;
    spawnDolphin(e.clientX, e.clientY);
  }
  function onTouch(e) {
    lastTouch = performance.now();
    if (e.defaultPrevented || !ok(e.target)) return;
    var t = e.changedTouches && e.changedTouches[0];
    if (t) spawnDolphin(t.clientX, t.clientY);
  }

  /* ------------------------------------------------------------------- boot */
  function boot() {
    injectCSS();
    tier = pickTier();

    glCanvas = D.createElement('canvas');
    glCanvas.id = 'ocean-bg';
    glCanvas.setAttribute('aria-hidden', 'true');
    gl = getGL(glCanvas);
    if (gl && !setupGL()) { gl = null; }
    if (!gl) { tier = 'none'; glCanvas = null; }
    DE.dataset.oceanTier = tier;

    fxCanvas = D.createElement('canvas');
    fxCanvas.id = 'ocean-fx';
    fxCanvas.setAttribute('aria-hidden', 'true');
    fx = fxCanvas.getContext('2d');

    var host = D.body || DE;
    host.insertBefore(fxCanvas, host.firstChild);
    host.insertBefore(gl ? glCanvas : buildFallback(), host.firstChild);

    resize();
    if (reduce) { if (gl) drawGL(11.5); stop(); } else kick();

    var rt = 0;
    function onResize() { clearTimeout(rt); rt = setTimeout(resize, 140); }
    W.addEventListener('resize', onResize, { passive: true });
    W.addEventListener('orientationchange', function () { clearTimeout(rt); rt = setTimeout(resize, 260); });
    D.addEventListener('visibilitychange', function () { D.hidden ? stop() : (t0 += 0, kick()); });
    D.addEventListener('click', onClick, true);
    D.addEventListener('touchend', onTouch, true);
    if (rmMQ.addEventListener) rmMQ.addEventListener('change', function (e) {
      reduce = e.matches; if (reduce) { drawGL(11.5); stop(); } else kick();
    });

    if (glCanvas) {
      glCanvas.addEventListener('webglcontextlost', function (e) {
        e.preventDefault(); stop(); gl = null;
      }, false);
      glCanvas.addEventListener('webglcontextrestored', function () {
        gl = getGL(glCanvas);
        if (gl && setupGL()) { resize(); kick(); }
        else { gl = null; DE.dataset.oceanTier = 'none'; }
      }, false);
    }
  }

  W.__ocean = { leap: spawnDolphin, dd: function (d, u) { return drawDolphin(fx, d, u); },
                tier: function () { return tier; } };

  if (D.body) boot();
  else D.addEventListener('DOMContentLoaded', boot);
})();
