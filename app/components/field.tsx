"use client";

import { useEffect, useRef } from "react";

// Full-page WebGL backdrop: a slowly drifting noise field drawn as
// iridescent topographic contours that brighten around the pointer.
const vertex = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const fragment = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 r;
uniform float t;
uniform vec2 m;
uniform float s;

float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){
  vec2 i=floor(p),f=fract(p);
  vec2 u=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.,a=.5;
  mat2 R=mat2(.8,.6,-.6,.8);
  for(int i=0;i<5;i++){v+=a*n(p);p=R*p*2.03;a*=.5;}
  return v;
}
vec3 pal(float x){return .5+.5*cos(6.2831*(x+vec3(.0,.33,.67)));}

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;
  vec2 mp=(m-.5*r)/r.y;
  float T=t*.035;
  vec2 P=uv*1.15+vec2(0.,s*.35);
  vec2 q=vec2(fbm(P+T),fbm(P-T+vec2(5.2,1.3)));
  float f=fbm(P+1.8*q+vec2(1.7,9.2)+T*.6);

  float d=length(uv-mp);
  float glow=exp(-d*d*4.5);

  float k=f*14.;
  float w=fwidth(k);
  float line=1.-smoothstep(w*.5,w*1.5,abs(fract(k+.5)-.5));

  vec3 iri=pal(f*1.6+q.x*.8+T*2.+d*.4);
  vec3 col=vec3(.031,.031,.039);
  col+=iri*pow(f,4.)*.10;
  col+=line*mix(vec3(.10,.10,.11),iri*.95,glow)*(.35+glow*1.1);
  col+=iri*glow*.05;

  float v=smoothstep(1.35,.2,length(uv*vec2(.8,1.)));
  col*=.55+.45*v;
  col*=mix(1.,.36,smoothstep(0.,1.,s));
  gl_FragColor=vec4(col,1.);
}`;

export function Field() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;
    gl.getExtension("OES_standard_derivatives");

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");
    const uM = gl.getUniformLocation(prog, "m");
    const uS = gl.getUniformLocation(prog, "s");

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scale = 1;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      scale = dpr * (innerWidth < 720 ? 0.75 : 0.62);
      el.width = Math.round(innerWidth * scale);
      el.height = Math.round(innerHeight * scale);
      gl.viewport(0, 0, el.width, el.height);
      gl.uniform2f(uR, el.width, el.height);
    };
    resize();

    // Pointer in CSS px (top-left origin); smoothed toward target.
    const target = { x: innerWidth * 0.62, y: innerHeight * 0.45 };
    const cur = { ...target };
    let lastMove = -1e9;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      target.x = e.clientX;
      target.y = e.clientY;
      lastMove = performance.now();
    };
    const onTilt = (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      target.x = innerWidth * (0.5 + x * 0.5);
      target.y = innerHeight * (0.45 + y * 0.5);
      lastMove = performance.now();
    };

    let raf = 0;
    let running = true;
    const start = performance.now();
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      if (now - lastMove > 2500) {
        // Idle: let the light wander on a slow Lissajous path.
        target.x = innerWidth * (0.5 + 0.28 * Math.sin(t * 0.21));
        target.y = innerHeight * (0.42 + 0.2 * Math.sin(t * 0.33 + 1));
      }
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      gl.uniform1f(uT, reduced ? 12 : t + 12);
      gl.uniform2f(uM, cur.x * scale, (innerHeight - cur.y) * scale);
      gl.uniform1f(uS, scrollY / innerHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (running && !reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const redraw = () => reduced && requestAnimationFrame(frame);
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(frame);
    };

    addEventListener("resize", resize);
    addEventListener("resize", redraw);
    addEventListener("scroll", redraw, { passive: true });
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("gmq:tilt", onTilt);
    document.addEventListener("visibilitychange", onVisibility);
    el.classList.add("on");
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("resize", redraw);
      removeEventListener("scroll", redraw);
      removeEventListener("pointermove", onMove);
      removeEventListener("gmq:tilt", onTilt);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvas} className="field" aria-hidden="true" />;
}
