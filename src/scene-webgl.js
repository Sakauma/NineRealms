/* Nine Realms: local WebGL2 landscapes. No assets, network, or independent timers. */
(function (root) {
  "use strict";
  var names = ["nebula", "aurora", "ember", "ivory", "ocean", "sakura", "firefly", "sunset"];
  var fullscreenVertex = `#version 300 es
  precision highp float;
  precision highp int;
  out vec2 vUv;
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;
  var landscapeFragment = `#version 300 es
  precision highp float;
  precision highp int;
  precision highp sampler3D;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler3D uNoise;
  uniform sampler2D uFarArt;
  uniform sampler2D uNearArt;
  uniform vec2 uViewport;
  uniform vec2 uPointer;
  uniform vec4 uBoard;
  uniform float uTime;
  uniform float uStrength;
  uniform float uCalm;
  uniform int uTheme;
  float field(vec3 p) { return texture(uNoise, p / 32.0).r; }
  float fbm(vec3 p) {
    return field(p) * .57 + field(p * 2.03 + 7.1) * .28 + field(p * 4.01 - 3.7) * .15;
  }
  float boardMask(vec2 uv) {
    if (uBoard.z < .001) return 1.0;
    vec2 q = abs(uv - (uBoard.xy + uBoard.zw * .5)) - uBoard.zw * .5;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    return mix(.18, 1.0, smoothstep(-.035, .085, d));
  }
  float ridge(vec2 uv, float depth, float offset) {
    float x = uv.x + uPointer.x * .012 / depth;
    float edge = offset + .05 * sin(x * 10.0 + depth * 3.0) +
      .022 * sin(x * 23.0 - depth) + .012 * sin(x * 47.0);
    return smoothstep(edge - .003, edge + .006, uv.y + uPointer.y * .008 / depth);
  }
  vec3 hills(vec3 col, vec2 uv, vec3 tone, float start, float opacity) {
    for (int i = 0; i < 3; i++) {
      float layer = float(i);
      col = mix(col, tone * (1.13 - layer * .15), ridge(uv, 3.3 - layer, start + layer * .072) * opacity);
    }
    return col;
  }
  vec3 nebula(vec2 uv) {
    float aspect = uViewport.x / uViewport.y;
    vec2 screen = (uv - .5) * vec2(aspect, 1.0);
    vec3 ray = normalize(vec3(screen * 1.7, 1.55));
    vec3 origin = vec3(uPointer * .19, -.8);
    vec3 sum = vec3(0.0);
    float opacity = 0.0;
    for (int i = 0; i < 14; i++) {
      float z = .5 + float(i) * .23;
      vec3 p = origin + ray * z;
      p.x += sin(p.z * .7 + uTime * .025) * .18;
      float n = fbm(p * 3.7 + vec3(uTime * .021, 0.0, 4.0));
      float arm = exp(-pow((p.y - .40 * sin(p.x * 1.6 + p.z * .75)) * 1.6, 2.0));
      float wisps = smoothstep(.43, .77, n) * arm;
      float hollow = .45 + .55 * smoothstep(.03, .30, abs(p.x + .16 * sin(p.z * 2.0)));
      float density = wisps * hollow * .20;
      float illumination = .55 + field(p * 4.0 + vec3(1.8, -.4, 0.0));
      vec3 tint = mix(vec3(.16, .68, .88), vec3(.72, .24, .83), smoothstep(-1.0, .7, p.x + p.z * .12));
      tint = mix(tint, vec3(.9, .62, .98), smoothstep(.63, .86, n) * .6);
      sum += (1.0 - opacity) * density * tint * illumination * 2.1;
      opacity += (1.0 - opacity) * density;
    }
    vec3 base = vec3(.025, .035, .085);
    float halo = exp(-length((uv - vec2(.86, .23)) * vec2(aspect, 1.0)) * 8.0);
    vec3 radiance = sum * (.5 + uStrength * .25);
    return base + radiance / (vec3(1.0) + radiance) * .72 + vec3(.04, .06, .11) * halo;
  }
  vec3 aurora(vec2 uv) {
    vec3 col = mix(vec3(.025, .07, .09), vec3(.03, .06, .13), uv.y);
    for (int layer = 0; layer < 3; layer++) {
      float d = float(layer), x = uv.x + uPointer.x * (.008 + d * .008);
      float fold = sin(x * (5.0 + d) + uTime * .11 + d * 1.3);
      float crown = .08 + d * .055 + fold * .065 + .025 * sin(x * 16.0 - d + uTime * .07);
      float distanceDown = uv.y - crown + uPointer.y * (.006 + d * .004);
      float curtain = smoothstep(0.0, .035, distanceDown) * exp(-max(0.0, distanceDown) * (8.0 + d * 1.5));
      float filament = .32 + .68 * pow(.5 + .5 * sin(x * (230.0 - d * 40.0) + sin(x * 20.0 + d) * 6.0 + uTime * .12), 3.0);
      float wave = .6 + .4 * fbm(vec3(x * 22.0, distanceDown * 6.0, uTime * .03 + d));
      vec3 hue = mix(vec3(.12, .82, .52), vec3(.20, .36, .87), clamp(distanceDown * 3.0 + d * .16, 0.0, 1.0));
      hue += vec3(.34, .04, .30) * pow(max(0.0, distanceDown * 2.0), 1.3);
      col += hue * curtain * filament * wave * (.60 + uStrength * .40);
      col += hue * exp(-abs(distanceDown - .025) * 100.0) * .08;
    }
    return hills(col, uv, vec3(.06, .17, .19), .78, .7);
  }
  vec3 ember(vec2 uv) {
    vec2 p = uv + uPointer * vec2(.014, .009);
    vec3 col = mix(vec3(.10, .045, .035), vec3(.16, .055, .035), p.y);
    float edge = exp(-pow((p.x - .06) * 5.0, 2.0)) + exp(-pow((p.x - .94) * 5.0, 2.0));
    float n = fbm(vec3(p.x * 10.0, p.y * 9.0 + uTime * .15, 2.0));
    float flow = .5 + .5 * sin(p.x * 32.0 + n * 8.0 + p.y * 5.0 - uTime * .19);
    float heat = pow(max(0.0, flow), 4.0) * edge * pow(p.y + .08, 1.6);
    vec3 flame = mix(vec3(.66, .10, .055), vec3(1.0, .56, .16), pow(flow, 3.0));
    col += flame * heat * (.26 + uStrength * .38);
    col += vec3(.36, .10, .025) * exp(-abs(p.y - 1.07) * 5.0) * edge;
    return col;
  }
  vec3 ivory(vec2 uv) {
    vec3 col = vec3(.941, .945, .914);
    col += (field(vec3(uv * 160.0, 0.0)) - .5) * .012;
    vec2 moon = (uv - vec2(.85, .19) + uPointer * .003) * vec2(uViewport.x / uViewport.y, 1.0);
    col = mix(col, vec3(1.0, .99, .93), (1.0 - smoothstep(.048, .05, length(moon))) * .8);
    col = hills(col, uv, vec3(.48, .58, .53), .69, .14 + uStrength * .10);
    float mist = exp(-pow((uv.y - .79 - .025 * sin(uv.x * 8.0 + uTime * .09)) * 22.0, 2.0));
    return mix(col, vec3(.98, .98, .94), mist * .3);
  }
  vec3 ocean(vec2 uv) {
    vec2 p = uv + uPointer * vec2(.012, .008);
    vec3 col = mix(vec3(.035, .18, .25), vec3(.012, .045, .11), p.y);
    float slant = p.x + p.y * .23 + sin(uTime * .04) * .018;
    float shafts = pow(.5 + .5 * sin(slant * 31.0 + sin(slant * 11.0) * 2.0), 12.0);
    float fine = pow(.5 + .5 * sin(slant * 91.0 + sin(slant * 23.0) * 3.0), 24.0);
    col += vec3(.18, .48, .52) * (shafts * .24 + fine * .09) * exp(-p.y * 2.2) * uStrength;
    vec2 q = p * vec2(12.0, 20.0);
    float caustic = abs(sin(q.x + sin(q.y + uTime * .12)) + sin(q.y - uTime * .17 + sin(q.x * .8)));
    float lattice = pow(max(0.0, 1.0 - caustic), 10.0);
    col += vec3(.10, .31, .35) * lattice * (.07 + .13 * smoothstep(.7, 1.0, p.y)) * uStrength;
    return hills(col, uv, vec3(.025, .10, .14), .91, .8);
  }
  vec3 sakura(vec2 uv) {
    vec3 col = mix(vec3(.975, .941, .949), vec3(.914, .837, .887), uv.y * .55);
    float cloud = fbm(vec3(uv * vec2(6.0, 11.0) + vec2(uTime * .015, 0.0), 9.0));
    col = mix(col, vec3(1.0, .98, .97), smoothstep(.48, .7, cloud) * .38);
    col = hills(col, uv, vec3(.66, .58, .68), .81, .15);
    return col;
  }
  vec3 firefly(vec2 uv) {
    vec3 col = mix(vec3(.025, .09, .075), vec3(.055, .14, .09), uv.y);
    vec2 moon = (uv - vec2(.84, .19) + uPointer * .004) * vec2(uViewport.x / uViewport.y, 1.0);
    float r = length(moon);
    col += vec3(.28, .38, .23) * exp(-r * 14.0) * .32;
    col += vec3(.48, .56, .32) * (1.0 - smoothstep(.033, .036, r)) * .28;
    float rays = pow(.5 + .5 * sin((uv.x + uv.y * .14) * 33.0), 16.0);
    col += vec3(.10, .18, .08) * rays * exp(-uv.y * 3.0) * uStrength * .16;
    float mist = fbm(vec3(uv * vec2(7.0, 16.0) - vec2(uTime * .025, 0.0), 5.0));
    col += vec3(.13, .20, .14) * smoothstep(.45, .7, mist) * exp(-pow((uv.y - .8) * 5.0, 2.0)) * .55;
    return col;
  }
  vec3 sunset(vec2 uv) {
    vec3 col = mix(vec3(.945, .837, .832), vec3(.986, .872, .697), clamp(uv.y * 1.3, 0.0, 1.0));
    vec2 sun = (uv - vec2(.84, .26) + uPointer * .003) * vec2(uViewport.x / uViewport.y, 1.0);
    col += vec3(.14, .10, .035) * exp(-length(sun) * 6.0);
    col = mix(col, vec3(1.0, .93, .71), (1.0 - smoothstep(.067, .070, length(sun))) * .95);
    for (int i = 0; i < 3; i++) {
      float d = float(i), h = .16 + d * .19;
      vec2 p = uv + uPointer * (.005 + d * .004);
      float n = fbm(vec3(p.x * (7.0 + d), p.y * 17.0, d * 5.0 + uTime * .035));
      float band = exp(-pow((p.y - h - .035 * sin(p.x * 6.0 + d + uTime * .04)) * 18.0, 2.0));
      float cloud = smoothstep(.37, .67, n) * band;
      vec3 tone = mix(vec3(.66, .45, .56), vec3(1.0, .84, .69), smoothstep(.48, .68, n));
      col = mix(col, tone, cloud * (.25 + uStrength * .20));
    }
    return hills(col, uv, vec3(.58, .46, .56), .76, .30);
  }
  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec3 base, color;
    if (uTheme == 0) { base = vec3(.047,.063,.125); color = nebula(uv); }
    else if (uTheme == 1) { base = vec3(.055,.098,.110); color = aurora(uv); }
    else if (uTheme == 2) { base = vec3(.129,.086,.075); color = ember(uv); }
    else if (uTheme == 3) { base = vec3(.941,.945,.914); color = ivory(uv); }
    else if (uTheme == 4) { base = vec3(.027,.106,.169); color = ocean(uv); }
    else if (uTheme == 5) { base = vec3(.973,.937,.949); color = sakura(uv); }
    else if (uTheme == 6) { base = vec3(.043,.110,.082); color = firefly(uv); }
    else { base = vec3(.984,.941,.894); color = sunset(uv); }
    vec4 farArt = texture(uFarArt, uv + uPointer * vec2(.006,.004));
    vec4 nearArt = texture(uNearArt, uv + uPointer * vec2(.022,.014));
    color = color * (1.0 - farArt.a) + farArt.rgb;
    color = color * (1.0 - nearArt.a) + nearArt.rgb;
    float contrast = clamp(.65 + uStrength * .45, .6, 1.28);
    color = mix(base, color, boardMask(uv) * contrast * mix(1.0,.56,uCalm));
    color = mix(color, vec3(dot(color, vec3(.2126,.7152,.0722))), uCalm * .20);
    float alpha = .94;
    outColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
  }`;
  var compositeFragment = `#version 300 es
  precision highp float;
  precision highp int;
  in vec2 vUv; out vec4 outColor;
  uniform sampler2D uImage;
  void main() { outColor = texture(uImage, vUv); }`;
  var particleVertex = `#version 300 es
  precision highp float;
  precision highp int;
  layout(location=0) in vec3 aPosition;
  layout(location=1) in vec3 aDetail;
  uniform vec2 uViewport;
  uniform vec2 uPointer;
  uniform float uTime;
  uniform float uStrength;
  uniform float uDpr;
  uniform float uMaxPoint;
  uniform int uTheme;
  out float vSeed; out float vDepth; out float vAngle; out vec2 vScreen;
  void main() {
    float originalZ = aPosition.z;
    float z = originalZ;
    vec2 unit = aPosition.xy;
    if (uTheme == 0 || uTheme == 1) {
      z = .85 + mod(originalZ - .85 - uTime * .018, 4.5);
    } else if (uTheme == 2 || uTheme == 4) {
      unit.y = mod(unit.y + 1.0 + uTime * (.035 + aDetail.z * .025) / z, 2.0) - 1.0;
      unit.x += sin(uTime * .3 + aDetail.z * 15.0) * .025;
    } else if (uTheme == 3 || uTheme == 5) {
      unit.y = mod(unit.y + 1.0 - uTime * (.025 + aDetail.z * .028) / z, 2.0) - 1.0;
      unit.x = mod(unit.x + 1.0 + uTime * .009 / z, 2.0) - 1.0;
      unit.x += sin(uTime * .24 + aDetail.z * 20.0) * .05;
    } else {
      unit += vec2(sin(uTime * .35 + aDetail.z * 21.0), cos(uTime * .29 + aDetail.z * 17.0)) * .022;
    }
    float aspect = uViewport.x / uViewport.y;
    vec2 world = unit * originalZ;
    world.x *= aspect;
    world -= vec2(uPointer.x, -uPointer.y) * (.15 + uStrength * .13);
    vec2 projected = world / (z * vec2(aspect, 1.0));
    gl_Position = vec4(projected, 0.0, 1.0);
    float size = uTheme == 3 || uTheme == 5 ? 11.0 : (uTheme == 4 ? 13.0 : 18.0);
    gl_PointSize = clamp(size * aDetail.x * (2.8 / z) * uDpr * (.8 + .18 * uStrength), 2.0, uMaxPoint);
    vSeed = aDetail.z; vDepth = z; vAngle = aDetail.y + uTime * (.16 + aDetail.z * .12);
    vScreen = vec2(projected.x * .5 + .5, .5 - projected.y * .5);
  }`;
  var particleFragment = `#version 300 es
  precision highp float;
  precision highp int;
  in float vSeed; in float vDepth; in float vAngle; in vec2 vScreen;
  out vec4 outColor;
  uniform int uTheme;
  uniform float uTime;
  uniform float uStrength;
  uniform float uCalm;
  uniform vec4 uBoard;
  void main() {
    vec2 q = gl_PointCoord - .5;
    float r = length(q), alpha = 0.0;
    vec3 color = vec3(.78,.85,1.0);
    if (uTheme == 3 || uTheme == 5) {
      float c = cos(vAngle), s = sin(vAngle);
      q = mat2(c,-s,s,c) * q;
      q.x /= .48 + abs(cos(vAngle * .7)) * .45;
      float petal = length(q * vec2(1.0,1.55));
      alpha = 1.0 - smoothstep(.31,.40,petal);
      if (uTheme == 5) {
        alpha *= smoothstep(-.09,.02,q.y + .32 + abs(q.x) * 1.8);
        color = mix(vec3(.77,.34,.52),vec3(1.0,.70,.79),q.y + .5);
      } else {
        color = mix(vec3(.29,.44,.31),vec3(.66,.66,.39),vSeed);
        alpha *= .67;
      }
      alpha *= .40 + .22 * uStrength;
    } else if (uTheme == 4) {
      alpha = exp(-pow((r - .29) * 32.0,2.0)) * .30;
      alpha += exp(-length(q - vec2(-.10,-.12)) * 40.0) * .55;
      color = vec3(.56,.91,.97);
    } else {
      float core = exp(-r * r * 850.0);
      float glow = exp(-r * r * 36.0);
      alpha = core * .85 + glow * .15;
      if (uTheme == 0 || uTheme == 1) {
        color = mix(vec3(.45,.76,1.0),vec3(.91,.72,1.0),vSeed);
        alpha *= .65 + .3 * sin(uTime * .5 + vSeed * 30.0);
        if (vSeed > .975) alpha += exp(-abs(q.x) * 160.0 - abs(q.y) * 12.0) * .18 +
          exp(-abs(q.y) * 160.0 - abs(q.x) * 12.0) * .18;
      } else if (uTheme == 2) {
        color = mix(vec3(1.0,.25,.08),vec3(1.0,.84,.37),vSeed);
        alpha += exp(-abs(q.x) * 75.0 - abs(q.y) * 19.0) * .17;
      } else if (uTheme == 6) {
        color = mix(vec3(.55,1.0,.56),vec3(.96,1.0,.52),vSeed);
        alpha *= .55 + .45 * sin(uTime * .9 + vSeed * 37.0);
      } else { color = vec3(.67,.39,.23); alpha *= .35; }
    }
    if (uBoard.z > .001) {
      vec2 d = abs(vScreen - (uBoard.xy + uBoard.zw * .5)) - uBoard.zw * .5;
      float distance = length(max(d,0.0)) + min(max(d.x,d.y),0.0);
      alpha *= mix(.08,1.0,smoothstep(-.03,.07,distance));
    }
    alpha *= clamp(1.2 - vDepth * .09,.45,1.0) * (.55 + uStrength * .35) * mix(1.0,.40,uCalm);
    alpha = clamp(alpha,0.0,.94);
    if (alpha < .002) discard;
    outColor = vec4(color * alpha, alpha);
  }`;

  function create(canvas, onFailure) {
    var gl = null, disposed = false, lost = false, resources = [], programs = [], textures = [];
    var framebuffer = null, target = null, targetWidth = 0, targetHeight = 0;
    var cssWidth = 1, cssHeight = 1, pixelRatio = 1, landscapeKey = "", pointLimit = 48;
    var noiseTexture = null, farTexture = null, nearTexture = null, vao = null, pointsVao = null;
    var backdrop = null, composite = null, particles = null;
    function resource(value, kind) { if (!value) throw new Error("Scene resource unavailable"); resources.push([kind,value]); return value; }
    function shader(type, source) {
      var value = resource(gl.createShader(type), "Shader");
      gl.shaderSource(value, source); gl.compileShader(value); return value;
    }
    function program(vertex, fragment, keys) {
      var handle = resource(gl.createProgram(), "Program");
      gl.attachShader(handle, shader(gl.VERTEX_SHADER, vertex));
      gl.attachShader(handle, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(handle);
      if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(handle) || "Scene shader did not link");
      }
      var result = { handle: handle, uniforms: {} };
      keys.forEach(function (key) { result.uniforms[key] = gl.getUniformLocation(handle, key); });
      programs.push(result); return result;
    }
    function texture2d() {
      var value = resource(gl.createTexture(), "Texture");
      gl.bindTexture(gl.TEXTURE_2D, value);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      textures.push(value); return value;
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", contextLost);
      resources.reverse().forEach(function (entry) {
        try { if (gl && !gl.isContextLost()) gl["delete" + entry[0]](entry[1]); } catch (_) {}
      });
      resources = []; programs = []; textures = [];
    }
    function contextLost(event) {
      event.preventDefault(); lost = true;
      if (!disposed && typeof onFailure === "function") onFailure();
    }
    function uploadNoise() {
      var size = 32, data = new Uint8Array(size * size * size), seed = 739391;
      for (var i = 0; i < data.length; i++) {
        seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; data[i] = seed >>> 24;
      }
      noiseTexture = resource(gl.createTexture(), "Texture");
      gl.bindTexture(gl.TEXTURE_3D, noiseTexture);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,size,size,size,0,gl.RED,gl.UNSIGNED_BYTE,data);
    }
    function uploadParticles() {
      var values = new Float32Array(420 * 6), seed = 192837;
      function random() { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; }
      for (var i = 0; i < 420; i++) {
        var offset = i * 6;
        values[offset] = random() * 2.3 - 1.15; values[offset+1] = random() * 2.3 - 1.15;
        values[offset+2] = .85 + random() * 4.5;
        values[offset+3] = .45 + random() * .65; values[offset+4] = random() * Math.PI * 2;
        values[offset+5] = random();
      }
      pointsVao = resource(gl.createVertexArray(),"VertexArray"); gl.bindVertexArray(pointsVao);
      var buffer = resource(gl.createBuffer(),"Buffer"); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
      gl.bindVertexArray(null);
    }
    function paintArt(theme, near) {
      var art = root.document.createElement("canvas"); art.width = 1024; art.height = 768;
      var ctx = art.getContext("2d");
      if (!ctx) return art;
      function line(points, color, size) {
        ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(points[0],points[1]);
        ctx.bezierCurveTo(points[2],points[3],points[4],points[5],points[6],points[7]); ctx.stroke();
      }
      if (theme === 6) {
        for (var i = 0; i < (near ? 8 : 13); i++) {
          var side = i % 2, inset = (i * 43 % (near ? 120 : 230));
          var x = side ? 1024 - inset : inset, height = (near ? 570 : 420) + (i * 79 % 200);
          var top = 790 - height, broad = near ? 85 : 59;
          ctx.fillStyle = near ? "rgba(4,28,23,.78)" : "rgba(15,52,39,.58)";
          ctx.fillRect(x-3,top,6,height);
          for (var tier = 0; tier < 7; tier++) {
            var y = top + tier * height * .105, spread = broad * (.25 + tier * .15);
            ctx.beginPath(); ctx.moveTo(x,y);
            ctx.lineTo(x+spread,y+height*.25); ctx.quadraticCurveTo(x,y+height*.205,x-spread,y+height*.25);
            ctx.closePath(); ctx.fill();
          }
        }
      } else if (theme === 5 || theme === 3) {
        var pink = theme === 5;
        ctx.save();
        if (near) { ctx.translate(1024,70); ctx.scale(-1.2,1.2); }
        else { ctx.translate(-20,120); ctx.scale(.9,.9); }
        line([0,0,70,85,170,55,310,150],pink ? "rgba(109,74,91,.36)" : "rgba(72,98,77,.30)",near ? 6 : 3);
        line([110,65,150,25,220,15,256,-15],pink ? "rgba(109,74,91,.30)" : "rgba(72,98,77,.26)",3);
        line([180,90,198,145,250,172,285,207],pink ? "rgba(109,74,91,.28)" : "rgba(72,98,77,.24)",2);
        line([247,119,280,86,330,102,357,80],pink ? "rgba(109,74,91,.28)" : "rgba(72,98,77,.24)",1.8);
        var points = [[128,49],[174,27],[227,1],[255,-11],[216,154],[252,179],[282,204],[298,143],[316,99],[354,81],[265,117]];
        points.forEach(function (point,index) {
          if (pink) {
            for (var petal = 0; petal < 5; petal++) {
              var angle = petal * Math.PI * 2 / 5;
              ctx.fillStyle = index % 2 ? "rgba(220,140,170,.72)" : "rgba(239,177,196,.78)";
              ctx.beginPath(); ctx.ellipse(point[0]+Math.cos(angle)*4,point[1]+Math.sin(angle)*4,4.4,3.5,angle,0,Math.PI*2); ctx.fill();
            }
            ctx.fillStyle = "#f7e7b2"; ctx.beginPath(); ctx.arc(point[0],point[1],1.4,0,Math.PI*2); ctx.fill();
          } else {
            ctx.fillStyle = "rgba(80,118,83,.30)";
            ctx.beginPath(); ctx.ellipse(point[0],point[1],13,3.4,-.6,0,Math.PI*2); ctx.fill();
          }
        });
        ctx.restore();
        if (!pink && near) {
          for (var stem = 0; stem < 13; stem++) {
            var px = stem * 12;
            line([px,768,px-9,710,px+11,661,px+24,616+stem*6],"rgba(79,116,80,.31)",1.5);
          }
        }
      }
      return art;
    }
    function updateArt(theme) {
      if (landscapeKey === String(theme)) return;
      landscapeKey = String(theme);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.bindTexture(gl.TEXTURE_2D,farTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,paintArt(theme,false));
      gl.bindTexture(gl.TEXTURE_2D,nearTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,paintArt(theme,true));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    }
    function resize(width,height,dpr) {
      if (disposed || lost) return;
      cssWidth = width; cssHeight = height; pixelRatio = Math.min(1.5,dpr);
      canvas.width = Math.max(1,Math.round(width * pixelRatio));
      canvas.height = Math.max(1,Math.round(height * pixelRatio));
      var scale = Math.min(1,960 / width,600 / height);
      targetWidth = Math.max(1,Math.round(width*scale)); targetHeight = Math.max(1,Math.round(height*scale));
      gl.bindTexture(gl.TEXTURE_2D,target);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,targetWidth,targetHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Scene buffer unavailable");
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    function common(programInfo,time,theme,strength,calm,pointer,board) {
      var u = programInfo.uniforms;
      gl.useProgram(programInfo.handle);
      gl.uniform2f(u.uViewport,cssWidth,cssHeight);
      gl.uniform2f(u.uPointer,pointer.x,pointer.y);
      gl.uniform4f(u.uBoard,board.x,board.y,board.width,board.height);
      gl.uniform1f(u.uTime,time); gl.uniform1f(u.uStrength,strength); gl.uniform1f(u.uCalm,calm);
      gl.uniform1i(u.uTheme,theme);
    }
    function draw(time,options,pointer,board) {
      if (disposed || lost || gl.isContextLost()) return false;
      var theme = Math.max(0,names.indexOf(options.theme));
      var strength = options.zen ? .48 : (options.intensity === "soft" ? .52 : options.intensity === "balanced" ? .88 : 1.32);
      var calm = options.zen ? 1 : 0;
      updateArt(theme);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.bindVertexArray(vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer); gl.viewport(0,0,targetWidth,targetHeight);
      common(backdrop,time,theme,strength,calm,pointer,board);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D,noiseTexture); gl.uniform1i(backdrop.uniforms.uNoise,0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,farTexture); gl.uniform1i(backdrop.uniforms.uFarArt,1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,nearTexture); gl.uniform1i(backdrop.uniforms.uNearArt,2);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,canvas.width,canvas.height);
      gl.useProgram(composite.handle);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D,target); gl.uniform1i(composite.uniforms.uImage,3);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      common(particles,time,theme,strength,calm,pointer,board);
      gl.uniform1f(particles.uniforms.uDpr,pixelRatio); gl.uniform1f(particles.uniforms.uMaxPoint,pointLimit);
      gl.bindVertexArray(pointsVao);
      var counts = [300,210,130,48,76,88,105,36];
      var count = Math.floor(counts[theme] * (cssWidth <= 600 ? .48 : 1) * (options.zen ? .48 : .72 + strength * .24));
      gl.drawArrays(gl.POINTS,0,Math.min(420,count));
      gl.bindVertexArray(null); gl.disable(gl.BLEND);
      return true;
    }
    try {
      gl = canvas.getContext("webgl2",{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,powerPreference:"low-power"});
      if (!gl) return null;
      pointLimit = Math.min(60,gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]);
      var commonKeys = ["uViewport","uPointer","uBoard","uTime","uStrength","uCalm","uTheme"];
      backdrop = program(fullscreenVertex,landscapeFragment,commonKeys.concat(["uNoise","uFarArt","uNearArt"]));
      composite = program(fullscreenVertex,compositeFragment,["uImage"]);
      particles = program(particleVertex,particleFragment,commonKeys.concat(["uDpr","uMaxPoint"]));
      vao = resource(gl.createVertexArray(),"VertexArray");
      uploadNoise(); uploadParticles();
      target = texture2d(); farTexture = texture2d(); nearTexture = texture2d();
      framebuffer = resource(gl.createFramebuffer(),"Framebuffer");
      canvas.addEventListener("webglcontextlost",contextLost,false);
      return { resize:resize,draw:draw,dispose:dispose };
    } catch (error) {
      dispose();
      // Diagnostics remain in developer tools; gameplay always has a 2D fallback.
      if (root.console && root.console.warn) root.console.warn("Scene renderer unavailable; using canvas.",error.message);
      return null;
    }
  }
  root.NineRealmsWebGL = { create:create };
})(window);
